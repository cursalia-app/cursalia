import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getAccessState } from "@/lib/services/access-service";
import { getSetting } from "@/lib/services/settings-service";
import { log } from "@/lib/services/audit-service";
import type { AffiliateDashboard, AffiliateReferral, CommissionStatus } from "@/lib/types/domain";

/**
 * Faceta de afiliado. Un afiliado es un cliente de pago, no un rol aparte.
 *
 * Dos invariantes que este módulo no puede romper:
 *  - la comisión se genera UNA sola vez por referido, sobre su pago de entrada;
 *  - el importe se congela al generarse y no vuelve a calcularse jamás.
 * Ambas están además respaldadas por restricciones únicas en la base de datos,
 * para que ni un webhook duplicado ni una carrera puedan saltárselas.
 */

export interface AffiliateProfile {
  userId: string;
  code: string;
  activatedAt: string;
}

export class SubscriptionRequiredError extends Error {
  constructor() {
    super("subscription_required");
    this.name = "SubscriptionRequiredError";
  }
}

export class SelfReferralError extends Error {
  constructor() {
    super("self_referral");
    this.name = "SelfReferralError";
  }
}

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const CODE_LENGTH = 8;
const MAX_CODE_ATTEMPTS = 5;

/** RN-10: solo un cliente con suscripción activa puede tener faceta de afiliado. */
export async function activateAffiliate(userId: string): Promise<AffiliateProfile> {
  const access = await getAccessState(userId);
  if (access.kind !== "subscribed") throw new SubscriptionRequiredError();

  const supabase = createSupabaseAdminClient();

  const { data: existing } = await supabase
    .from("affiliate_profiles")
    .select("user_id, code, activated_at")
    .eq("user_id", userId)
    .maybeSingle();

  if (existing) {
    return { userId: existing.user_id, code: existing.code, activatedAt: existing.activated_at };
  }

  for (let attempt = 0; attempt < MAX_CODE_ATTEMPTS; attempt++) {
    const code = generateCode();
    const { data, error } = await supabase
      .from("affiliate_profiles")
      .insert({ user_id: userId, code })
      .select("user_id, code, activated_at")
      .single();

    if (!error && data) {
      await log(userId, "activate_affiliate", "affiliate_profile", userId, { code });
      return { userId: data.user_id, code: data.code, activatedAt: data.activated_at };
    }

    // 23505 es colisión de código: se reintenta con otro.
    if (error && error.code !== "23505") throw new Error(`affiliate-service: ${error.message}`);
  }

  throw new Error("affiliate-service: no se pudo generar un código único");
}

export async function resolveReferralCode(code: string): Promise<string | null> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("resolve_referral_code", {
    referral_code: code.trim().toUpperCase(),
  });

  if (error || typeof data !== "string") return null;
  return data;
}

/**
 * RN-12: la atribución se graba en el registro del referido, antes de que exista
 * ningún pago, y no vuelve a cambiar nunca.
 */
export async function attachReferral(newUserId: string, code: string): Promise<void> {
  const affiliateUserId = await resolveReferralCode(code);
  if (!affiliateUserId) return;
  if (affiliateUserId === newUserId) throw new SelfReferralError();

  const supabase = createSupabaseAdminClient();

  const { error } = await supabase
    .from("profiles")
    .update({ referred_by: affiliateUserId })
    .eq("id", newUserId)
    .is("referred_by", null);

  if (error) throw new Error(`affiliate-service: ${error.message}`);
}

/**
 * RN-11: la comisión nace del pago de entrada del referido, una sola vez.
 * Las mensualidades no generan nada. Recibir el mismo webhook dos veces tampoco.
 */
export async function generateCommissionForPayment(paymentId: string): Promise<string | null> {
  const supabase = createSupabaseAdminClient();

  const { data: payment } = await supabase
    .from("payments")
    .select("id, user_id, type")
    .eq("id", paymentId)
    .maybeSingle();

  if (!payment || payment.type !== "entry") return null;

  const { data: referred } = await supabase
    .from("profiles")
    .select("id, referred_by")
    .eq("id", payment.user_id)
    .maybeSingle();

  const affiliateUserId = referred?.referred_by;
  if (!affiliateUserId) return null;

  // El importe se copia del ajuste vigente y queda congelado en la fila.
  const amountCents = await getSetting("entry_commission_cents");

  const { data, error } = await supabase
    .from("commissions")
    .insert({
      affiliate_user_id: affiliateUserId,
      referred_user_id: payment.user_id,
      payment_id: payment.id,
      amount_cents: amountCents,
    })
    .select("id")
    .single();

  if (error) {
    // Violación de unicidad: la comisión ya existía. Es el comportamiento correcto.
    if (error.code === "23505") return null;
    throw new Error(`affiliate-service: ${error.message}`);
  }

  await log(null, "generate_commission", "commission", data.id, {
    affiliate_user_id: affiliateUserId,
    referred_user_id: payment.user_id,
    amount_cents: amountCents,
  });

  return data.id;
}

interface DashboardReferralRow {
  id: string;
  email: string;
  created_at: string;
}

interface DashboardCommissionRow {
  id: string;
  referred_user_id: string;
  amount_cents: number;
  status: CommissionStatus;
}

export async function getAffiliateDashboard(
  userId: string,
  siteUrl: string,
): Promise<AffiliateDashboard | null> {
  const supabase = await createSupabaseServerClient();

  const { data: profile } = await supabase
    .from("affiliate_profiles")
    .select("code")
    .eq("user_id", userId)
    .maybeSingle();

  if (!profile) return null;

  const admin = createSupabaseAdminClient();
  const [{ data: referrals }, { data: commissions }] = await Promise.all([
    admin
      .from("profiles")
      .select("id, email, created_at")
      .eq("referred_by", userId)
      .order("created_at", { ascending: false })
      .returns<DashboardReferralRow[]>(),
    supabase
      .from("commissions")
      .select("id, referred_user_id, amount_cents, status")
      .eq("affiliate_user_id", userId)
      .returns<DashboardCommissionRow[]>(),
  ]);

  const byReferred = new Map((commissions ?? []).map((c) => [c.referred_user_id, c]));

  const rows: AffiliateReferral[] = (referrals ?? []).map((referral) => {
    const commission = byReferred.get(referral.id);
    return {
      id: referral.id,
      maskedEmail: maskEmail(referral.email),
      signedUpAt: referral.created_at,
      commissionStatus: commission?.status ?? null,
      commissionCents: commission?.amount_cents ?? null,
    };
  });

  const totalEarnedCents = (commissions ?? [])
    .filter((c) => c.status === "paid")
    .reduce((acc, c) => acc + c.amount_cents, 0);
  const totalPendingCents = (commissions ?? [])
    .filter((c) => c.status === "pending" || c.status === "approved")
    .reduce((acc, c) => acc + c.amount_cents, 0);

  return {
    code: profile.code,
    link: `${siteUrl.replace(/\/$/, "")}/registro?ref=${profile.code}`,
    referrals: rows,
    totalEarnedCents,
    totalPendingCents,
  };
}

/** El afiliado ve a quién ha traído, pero no su correo completo. */
export function maskEmail(email: string): string {
  const [local, domain] = email.split("@");
  if (!domain) return "•••";
  return `${local.slice(0, 1)}••••@${domain}`;
}

function generateCode(): string {
  const bytes = new Uint8Array(CODE_LENGTH);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => CODE_ALPHABET[byte % CODE_ALPHABET.length]).join("");
}
