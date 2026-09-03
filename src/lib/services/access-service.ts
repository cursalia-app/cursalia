import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getSetting } from "@/lib/services/settings-service";
import type { AccessState } from "@/lib/types/domain";

/**
 * El módulo más crítico del sistema: la única puerta de entrada al contenido.
 *
 * La regla de acceso (RN-02) NO se implementa aquí. Vive una sola vez, en la
 * función SQL `public.has_content_access`, que es también la que usan todas las
 * policies RLS. Este servicio la consulta y, por separado, describe el estado
 * para que la interfaz sepa qué contar. Comparar fechas de prueba o estados de
 * suscripción en cualquier otro punto del código está prohibido.
 */

/** Respuesta autoritativa: ¿puede esta persona ver contenido ahora mismo? */
export async function hasContentAccess(userId: string): Promise<boolean> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("has_content_access", { uid: userId });

  // Fallo seguro (RN-14): ante la duda, no hay acceso.
  if (error) return false;
  return data === true;
}

/**
 * Momento en que caduca el acceso. Acota la caducidad de las URLs firmadas, de
 * forma que una URL emitida durante la prueba deje de servir justo al acabar.
 */
export async function getAccessExpiry(userId: string): Promise<Date | null> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("access_expires_at", { uid: userId });

  if (error || typeof data !== "string") return null;

  const expiry = new Date(data);
  return Number.isNaN(expiry.getTime()) ? null : expiry;
}

/**
 * Estado de acceso con su etiqueta. El booleano manda: si la función SQL dice
 * que no hay acceso, da igual lo que digan las filas.
 */
export async function getAccessState(userId: string): Promise<AccessState> {
  const allowed = await hasContentAccess(userId);
  if (!allowed) return { kind: "none" };

  const supabase = await createSupabaseServerClient();

  const [{ data: subscription }, { data: profile }] = await Promise.all([
    supabase
      .from("subscriptions")
      .select("status, current_period_end, past_due_since")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase.from("profiles").select("trial_started_at").eq("id", userId).maybeSingle(),
  ]);

  if (subscription?.status === "active") {
    return { kind: "subscribed", renewsAt: subscription.current_period_end ?? null };
  }

  if (subscription?.status === "past_due" && subscription.past_due_since) {
    const graceDays = await getSetting("grace_period_days");
    const graceEndsAt = addDays(subscription.past_due_since, graceDays);
    return { kind: "grace", graceEndsAt };
  }

  if (profile?.trial_started_at) {
    const minutes = await getSetting("trial_duration_minutes");
    return { kind: "trial", trialEndsAt: addMinutes(profile.trial_started_at, minutes) };
  }

  // Hay acceso pero no sabemos ponerle nombre: se trata como suscripción sin
  // fecha antes que negar por error algo que la base de datos ya ha concedido.
  return { kind: "subscribed", renewsAt: null };
}

/**
 * Arranca la prueba. Idempotente: si ya estaba arrancada, no la reinicia jamás.
 * Normalmente lo hace el trigger al verificar el correo; esto existe para el
 * alta manual desde soporte y para los casos en que el trigger no se disparó.
 * Va con `service_role` porque el propio usuario tiene prohibido tocar la columna.
 */
export async function startTrial(userId: string): Promise<void> {
  const supabase = createSupabaseAdminClient();

  const { error } = await supabase
    .from("profiles")
    .update({ trial_started_at: new Date().toISOString() })
    .eq("id", userId)
    .is("trial_started_at", null);

  if (error) throw new Error(`access-service: ${error.message}`);
}

function addMinutes(iso: string, minutes: number): string {
  return new Date(new Date(iso).getTime() + minutes * 60_000).toISOString();
}

function addDays(iso: string, days: number): string {
  return new Date(new Date(iso).getTime() + days * 86_400_000).toISOString();
}
