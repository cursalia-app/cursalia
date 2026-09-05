import { createClient } from "@supabase/supabase-js";
import { getPublicEnv, getSupabaseAdminEnv } from "@/lib/env";
import type { Database } from "@/lib/types/database";

/**
 * Cliente con `service_role`: SALTA RLS por completo.
 * Solo puede usarse desde el servidor y solo donde no hay un usuario en cuyo
 * nombre actuar: el webhook de pagos, el alta de dispositivos y la generación
 * de comisiones. Jamás debe llegar al navegador.
 */
export function createSupabaseAdminClient() {
  if (typeof window !== "undefined") {
    throw new Error("El cliente service_role no puede usarse en el navegador");
  }

  const { NEXT_PUBLIC_SUPABASE_URL } = getPublicEnv();
  const { SUPABASE_SERVICE_ROLE_KEY } = getSupabaseAdminEnv();

  return createClient<Database>(NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
