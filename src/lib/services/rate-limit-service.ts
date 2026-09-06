import { createSupabaseAdminClient } from "@/lib/supabase/admin";

/**
 * Rate limiting delegado en Postgres. La ventaja de vivir en la base es que
 * funciona idéntico en cualquier réplica de la aplicación —serverless, dev,
 * futuro edge— sin infraestructura adicional. La función `check_rate_limit`
 * hace count+insert atómicos y limpia lo caducado en la misma llamada.
 *
 * Fail-open por diseño: si la base está caída, permitir en vez de tirar el
 * tráfico. Se registra en logs para que el fallo sea auditable, pero denegar
 * el login a todo el mundo cuando la BD tose es peor cura que enfermedad.
 */

export interface RateLimitOptions {
  bucket: string;
  actor: string;
  max: number;
  windowSeconds: number;
}

export async function checkRateLimit(options: RateLimitOptions): Promise<boolean> {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase.rpc("check_rate_limit", {
    bucket: options.bucket,
    actor: options.actor,
    max_events: options.max,
    window_seconds: options.windowSeconds,
  });

  if (error) {
    console.error(
      `[rate-limit] fallo consultando ${options.bucket} — se permite: ${error.message}`,
    );
    return true;
  }

  return data === true;
}

/**
 * Presets. Los tenemos aquí, no en cada llamador, para que endurecer o suavizar
 * una política sea un cambio en un solo sitio.
 */
export const RateLimits = {
  authSignIn:      { max: 5,  windowSeconds: 15 * 60 },
  authSignUp:      { max: 3,  windowSeconds: 60 * 60 },
  authPasswordReset: { max: 3, windowSeconds: 60 * 60 },
  deviceRegister:  { max: 10, windowSeconds: 60 * 60 },
  signedVideo:     { max: 30, windowSeconds: 60 * 60 },
  signedBook:      { max: 30, windowSeconds: 60 * 60 },
} as const;
