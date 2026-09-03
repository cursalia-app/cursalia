import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getSetting } from "@/lib/services/settings-service";
import type { UserDevice } from "@/lib/types/domain";

/**
 * Dispositivos registrados por cuenta (RN-08).
 *
 * El límite NO se comprueba contando desde aquí: lo impone un trigger en la base
 * de datos. Contar en la aplicación deja una ventana entre el conteo y la
 * inserción por la que dos peticiones simultáneas colarían un quinto aparato.
 * Este servicio se limita a interpretar el error que devuelve el trigger.
 */

export type DeviceResult =
  | { status: "allowed"; deviceId: string }
  | { status: "limit_reached"; maxDevices: number };

/** El trigger lanza esta excepción al llegar al máximo. */
const LIMIT_ERROR = "device_limit_reached";

export async function registerOrTouchDevice(
  userId: string,
  fingerprint: string,
  userAgent: string | null,
): Promise<DeviceResult> {
  const supabase = createSupabaseAdminClient();
  const now = new Date().toISOString();

  // Un dispositivo ya conocido y activo solo actualiza su última visita.
  const { data: existing } = await supabase
    .from("user_devices")
    .select("id, released_at")
    .eq("user_id", userId)
    .eq("fingerprint", fingerprint)
    .maybeSingle();

  if (existing && existing.released_at === null) {
    await supabase.from("user_devices").update({ last_seen_at: now }).eq("id", existing.id);
    return { status: "allowed", deviceId: existing.id };
  }

  // Uno liberado que vuelve cuenta como alta nueva: tiene que caber en el límite.
  if (existing) {
    const activeCount = await countActiveDevices(userId);
    const maxDevices = await getSetting("max_devices");
    if (activeCount >= maxDevices) return { status: "limit_reached", maxDevices };

    const { error } = await supabase
      .from("user_devices")
      .update({ released_at: null, last_seen_at: now, user_agent: userAgent })
      .eq("id", existing.id);

    if (error) return { status: "limit_reached", maxDevices };
    return { status: "allowed", deviceId: existing.id };
  }

  const { data, error } = await supabase
    .from("user_devices")
    .insert({ user_id: userId, fingerprint, user_agent: userAgent, last_seen_at: now })
    .select("id")
    .single();

  if (error) {
    if (error.message.includes(LIMIT_ERROR)) {
      return { status: "limit_reached", maxDevices: await getSetting("max_devices") };
    }
    throw new Error(`device-service: ${error.message}`);
  }

  return { status: "allowed", deviceId: data.id };
}

export async function listDevices(userId: string): Promise<UserDevice[]> {
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase
    .from("user_devices")
    .select("id, fingerprint, user_agent, last_seen_at, released_at")
    .eq("user_id", userId)
    .is("released_at", null)
    .order("last_seen_at", { ascending: false });

  if (error) throw new Error(`device-service: ${error.message}`);

  return (data ?? []).map((row) => ({
    id: row.id,
    fingerprint: row.fingerprint,
    label: describeDevice(row.user_agent),
    userAgent: row.user_agent,
    lastSeenAt: row.last_seen_at,
    isCurrent: false,
  }));
}

export class ReleaseCooldownError extends Error {
  constructor(readonly availableAt: string) {
    super("release_cooldown");
    this.name = "ReleaseCooldownError";
  }
}

/**
 * Libera un dispositivo. Una liberación cada 30 días: si no, el límite no
 * limitaría nada.
 */
export async function releaseDevice(userId: string, deviceId: string): Promise<void> {
  const supabase = createSupabaseAdminClient();
  const cooldownDays = await getSetting("device_release_cooldown_days");

  const { data: lastRelease } = await supabase
    .from("user_devices")
    .select("released_at")
    .eq("user_id", userId)
    .not("released_at", "is", null)
    .order("released_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (lastRelease?.released_at) {
    const availableAt = new Date(
      new Date(lastRelease.released_at).getTime() + cooldownDays * 86_400_000,
    );
    if (availableAt > new Date()) throw new ReleaseCooldownError(availableAt.toISOString());
  }

  const { error } = await supabase
    .from("user_devices")
    .update({ released_at: new Date().toISOString() })
    .eq("id", deviceId)
    .eq("user_id", userId);

  if (error) throw new Error(`device-service: ${error.message}`);
}

async function countActiveDevices(userId: string): Promise<number> {
  const supabase = createSupabaseAdminClient();
  const { data } = await supabase
    .from("user_devices")
    .select("id")
    .eq("user_id", userId)
    .is("released_at", null);

  return data?.length ?? 0;
}

/** Etiqueta legible a partir del user-agent. Sin librerías: no hace falta precisión. */
export function describeDevice(userAgent: string | null): string {
  if (!userAgent) return "Dispositivo desconocido";

  const browser = /Edg\//.test(userAgent)
    ? "Edge"
    : /OPR\/|Opera/.test(userAgent)
      ? "Opera"
      : /Firefox\//.test(userAgent)
        ? "Firefox"
        : /Chrome\//.test(userAgent)
          ? "Chrome"
          : /Safari\//.test(userAgent)
            ? "Safari"
            : "Navegador";

  const system = /iPhone/.test(userAgent)
    ? "iPhone"
    : /iPad/.test(userAgent)
      ? "iPad"
      : /Android/.test(userAgent)
        ? "Android"
        : /Mac OS X/.test(userAgent)
          ? "Mac"
          : /Windows/.test(userAgent)
            ? "Windows"
            : /Linux/.test(userAgent)
              ? "Linux"
              : "sistema desconocido";

  return `${browser} · ${system}`;
}
