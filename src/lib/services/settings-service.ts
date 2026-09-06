import { createSupabaseServerClient } from "@/lib/supabase/server";
import { log } from "@/lib/services/audit-service";

/**
 * Ajustes editables en caliente, sin desplegar código.
 * Los valores por defecto de aquí son la red de seguridad: si la fila no existe
 * o la base de datos no responde, el producto sigue funcionando con el valor
 * documentado en vez de romperse.
 */

export const SETTING_DEFAULTS = {
  trial_duration_minutes: 30,
  max_devices: 4,
  entry_commission_cents: 3000,
  grace_period_days: 3,
  device_release_cooldown_days: 30,
  subscription_price_cents: 2900,
  trial_ip_cooldown_hours: 24,
} as const;

export type SettingKey = keyof typeof SETTING_DEFAULTS;

/** Caché corta: los ajustes se leen en casi todas las peticiones y cambian poco. */
const CACHE_TTL_MS = 30_000;

interface CacheEntry {
  value: number;
  expiresAt: number;
}

const cache = new Map<SettingKey, CacheEntry>();

export async function getSetting<K extends SettingKey>(key: K): Promise<number> {
  const cached = cache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.value;

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("app_settings")
    .select("value")
    .eq("key", key)
    .maybeSingle();

  const parsed = error ? null : parseNumeric(data?.value);
  const value = parsed ?? SETTING_DEFAULTS[key];

  cache.set(key, { value, expiresAt: Date.now() + CACHE_TTL_MS });
  return value;
}

export async function setSetting(key: SettingKey, value: number, actorId: string): Promise<void> {
  const supabase = await createSupabaseServerClient();

  const { data: previous } = await supabase
    .from("app_settings")
    .select("value")
    .eq("key", key)
    .maybeSingle();

  const { error } = await supabase
    .from("app_settings")
    .update({ value, updated_at: new Date().toISOString() })
    .eq("key", key);

  if (error) throw new Error(`settings-service: ${error.message}`);

  cache.delete(key);

  await log(actorId, "update_setting", "app_setting", null, {
    key,
    from: parseNumeric(previous?.value),
    to: value,
  });
}

/** Se expone para los tests y para invalidar tras una migración de datos. */
export function clearSettingsCache(): void {
  cache.clear();
}

function parseNumeric(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}
