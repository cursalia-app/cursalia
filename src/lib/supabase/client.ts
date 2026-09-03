"use client";

import { createBrowserClient } from "@supabase/ssr";
import { getPublicEnv } from "@/lib/env";
import type { Database } from "@/lib/types/database";

/**
 * Cliente de navegador. SOLO para autenticación y realtime.
 * Ningún componente de React consulta datos de negocio con él: eso pasa siempre
 * por los servicios, en el servidor.
 */
export function createClient() {
  const env = getPublicEnv();
  return createBrowserClient<Database>(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
}
