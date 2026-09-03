import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { getPublicEnv } from "@/lib/env";
import type { Database } from "@/lib/types/database";

/**
 * Cliente de servidor con la sesión del usuario. Respeta RLS: es la vía normal
 * para todo lo que se lee en nombre de alguien.
 */
export async function createSupabaseServerClient() {
  const cookieStore = await cookies();
  const env = getPublicEnv();

  return createServerClient<Database>(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (cookiesToSet) => {
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options);
            }
          } catch {
            // Los Server Components no pueden escribir cookies; el middleware
            // ya refresca la sesión, así que aquí se puede ignorar.
          }
        },
      },
    },
  );
}

/** Usuario de la sesión actual, o null. Nunca confía en nada que venga del cliente. */
export async function getCurrentUser() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}

/** Igual que la anterior, pero exige sesión. Para servicios que no tienen sentido sin usuario. */
export async function requireCurrentUserId(): Promise<string> {
  const user = await getCurrentUser();
  if (!user) throw new Error("unauthenticated");
  return user.id;
}

export interface CurrentProfile {
  id: string;
  email: string;
  isAdmin: boolean;
  createdAt: string;
  trialStartedAt: string | null;
}

/**
 * Perfil del usuario de la sesión. El correo se lee de `profiles`, que es la
 * copia que también alimenta la marca de agua del reproductor.
 */
export async function getCurrentProfile(): Promise<CurrentProfile | null> {
  const user = await getCurrentUser();
  if (!user) return null;

  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("profiles")
    .select("id, email, is_admin, created_at, trial_started_at")
    .eq("id", user.id)
    .maybeSingle();

  if (!data) return null;

  return {
    id: data.id,
    email: data.email,
    isAdmin: data.is_admin,
    createdAt: data.created_at,
    trialStartedAt: data.trial_started_at,
  };
}
