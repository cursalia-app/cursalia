import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { generateCommissionForPayment } from "@/lib/services/affiliate-service";
import { log } from "@/lib/services/audit-service";
import { getPaymentsEnv } from "@/lib/env";
import type { Subscription } from "@/lib/types/domain";

/**
 * Frontera con la pasarela de pagos.
 *
 * El cobro lo gestiona el equipo fuera de esta aplicación: aquí solo se consumen
 * eventos (RN-14). El proveedor concreto está por definir, así que el contrato
 * de evento es propio y genérico; adaptarlo a la pasarela real es cuestión de
 * traducir su carga útil a este esquema, sin tocar nada más.
 *
 * Este servicio es idempotente por diseño: el mismo evento dos veces deja
 * exactamente el mismo estado, y jamás duplica pagos ni comisiones.
 */

const webhookEventSchema = z.object({
  id: z.string().min(1),
  type: z.enum([
    "payment.succeeded",
    "subscription.activated",
    "subscription.past_due",
    "subscription.canceled",
    "subscription.expired",
  ]),
  occurred_at: z.string(),
  customer: z.object({
    external_id: z.string().min(1),
    email: z.string().email(),
  }),
  payment: z
    .object({
      external_id: z.string().min(1),
      amount_cents: z.number().int().nonnegative(),
      currency: z.string().default("EUR"),
      kind: z.enum(["entry", "recurring"]),
      paid_at: z.string(),
    })
    .optional(),
  subscription: z
    .object({
      external_id: z.string().min(1),
      current_period_end: z.string().nullable().optional(),
    })
    .optional(),
});

export type WebhookEvent = z.infer<typeof webhookEventSchema>;

export type WebhookResult =
  | { status: "processed"; eventId: string }
  | { status: "duplicate"; eventId: string }
  | { status: "ignored"; reason: string }
  | { status: "invalid_signature" }
  | { status: "invalid_payload"; reason: string };

/** HMAC-SHA256 del cuerpo crudo. Comparación en tiempo constante. */
export function verifySignature(rawBody: string, signature: string, secret: string): boolean {
  const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
  const received = signature.trim().replace(/^sha256=/, "");

  if (expected.length !== received.length) return false;
  return timingSafeEqual(Buffer.from(expected), Buffer.from(received));
}

export async function handleWebhookEvent(
  rawBody: string,
  signature: string | null,
): Promise<WebhookResult> {
  const { PAYMENTS_WEBHOOK_SECRET } = getPaymentsEnv();

  // Sin firma válida no se lee siquiera el contenido.
  if (!signature || !verifySignature(rawBody, signature, PAYMENTS_WEBHOOK_SECRET)) {
    return { status: "invalid_signature" };
  }

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(rawBody);
  } catch {
    return { status: "invalid_payload", reason: "json_malformado" };
  }

  const parsed = webhookEventSchema.safeParse(parsedJson);
  if (!parsed.success) {
    return { status: "invalid_payload", reason: parsed.error.issues[0]?.message ?? "esquema" };
  }

  const event = parsed.data;
  const supabase = createSupabaseAdminClient();

  // La unicidad de external_event_id es la barrera de idempotencia: si la fila ya
  // existe, este evento se procesó y no se vuelve a aplicar nada.
  const { error: insertError } = await supabase
    .from("webhook_events")
    .insert({ external_event_id: event.id, payload: parsed.data });

  if (insertError) {
    if (insertError.code === "23505") return { status: "duplicate", eventId: event.id };
    throw new Error(`billing-service: ${insertError.message}`);
  }

  try {
    const applied = await applyEvent(event);
    await supabase
      .from("webhook_events")
      .update({ processed_at: new Date().toISOString() })
      .eq("external_event_id", event.id);

    return applied;
  } catch (error) {
    const message = error instanceof Error ? error.message : "error desconocido";
    await supabase
      .from("webhook_events")
      .update({ error: message })
      .eq("external_event_id", event.id);
    throw error;
  }
}

async function applyEvent(event: WebhookEvent): Promise<WebhookResult> {
  const supabase = createSupabaseAdminClient();
  const userId = await resolveUserId(event);

  if (!userId) return { status: "ignored", reason: "cliente_desconocido" };

  if (event.type === "payment.succeeded" && event.payment) {
    const { data: payment, error } = await supabase
      .from("payments")
      .insert({
        user_id: userId,
        type: event.payment.kind,
        amount_cents: event.payment.amount_cents,
        currency: event.payment.currency,
        external_payment_id: event.payment.external_id,
        paid_at: event.payment.paid_at,
      })
      .select("id")
      .single();

    // Un pago repetido no es un fallo: es el mismo cobro llegando dos veces.
    if (error && error.code !== "23505") {
      throw new Error(`billing-service: ${error.message}`);
    }

    if (payment) {
      await generateCommissionForPayment(payment.id);
      await log(null, "payment_recorded", "payment", payment.id, {
        type: event.payment.kind,
        amount_cents: event.payment.amount_cents,
      });
    }
  }

  const status = subscriptionStatusFor(event.type);
  if (status) {
    await upsertSubscription(userId, status, event);
    await log(null, "subscription_updated", "subscription", null, { user_id: userId, status });
  }

  return { status: "processed", eventId: event.id };
}

function subscriptionStatusFor(type: WebhookEvent["type"]): Subscription["status"] | null {
  switch (type) {
    case "subscription.activated":
      return "active";
    case "subscription.past_due":
      return "past_due";
    case "subscription.canceled":
      return "canceled";
    case "subscription.expired":
      return "expired";
    default:
      return null;
  }
}

async function upsertSubscription(
  userId: string,
  status: Subscription["status"],
  event: WebhookEvent,
): Promise<void> {
  const supabase = createSupabaseAdminClient();
  const externalId = event.subscription?.external_id ?? null;

  const { data: existing } = await supabase
    .from("subscriptions")
    .select("id, past_due_since")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const patch = {
    status,
    current_period_end: event.subscription?.current_period_end ?? null,
    external_subscription_id: externalId,
    // El periodo de cortesía se cuenta desde el primer impago, no desde el último aviso.
    past_due_since:
      status === "past_due" ? (existing?.past_due_since ?? event.occurred_at) : null,
    canceled_at: status === "canceled" ? event.occurred_at : null,
  };

  if (existing) {
    const { error } = await supabase.from("subscriptions").update(patch).eq("id", existing.id);
    if (error) throw new Error(`billing-service: ${error.message}`);
    return;
  }

  const { error } = await supabase.from("subscriptions").insert({ user_id: userId, ...patch });
  if (error) throw new Error(`billing-service: ${error.message}`);
}

/** El cliente se localiza por su identificador externo y, en su defecto, por correo. */
async function resolveUserId(event: WebhookEvent): Promise<string | null> {
  const supabase = createSupabaseAdminClient();

  const { data: byExternalId } = await supabase
    .from("profiles")
    .select("id")
    .eq("external_customer_id", event.customer.external_id)
    .maybeSingle();

  if (byExternalId) return byExternalId.id;

  const { data: byEmail } = await supabase
    .from("profiles")
    .select("id")
    .eq("email", event.customer.email)
    .maybeSingle();

  if (!byEmail) return null;

  // Primera vez que vemos a este cliente en la pasarela: se ata su identificador.
  await supabase
    .from("profiles")
    .update({ external_customer_id: event.customer.external_id })
    .eq("id", byEmail.id);

  return byEmail.id;
}

export async function getSubscriptionState(userId: string): Promise<Subscription | null> {
  const supabase = await createSupabaseServerClient();

  const { data } = await supabase
    .from("subscriptions")
    .select("status, current_period_end, past_due_since")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!data) return null;

  // `isActive` viaja calculado desde aquí para que los componentes de página
  // no llamen `Date.now()` durante el render (regla de pureza de React 19).
  const isActive =
    data.status === "active" &&
    Boolean(data.current_period_end) &&
    new Date(data.current_period_end as string).getTime() > Date.now();

  return {
    status: data.status,
    currentPeriodEnd: data.current_period_end,
    pastDueSince: data.past_due_since,
    isActive,
  };
}
