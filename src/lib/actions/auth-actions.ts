"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { attachReferral } from "@/lib/services/affiliate-service";
import { getPublicEnv } from "@/lib/env";

/**
 * Autenticación. La verificación de correo es obligatoria: hasta que no se
 * confirma, la prueba de 30 minutos no arranca (RN-03).
 */

export interface FormState {
  error?: string;
  notice?: string;
}

const credentialsSchema = z.object({
  email: z.string().email("Introduce un correo válido"),
  password: z.string().min(8, "La contraseña necesita al menos 8 caracteres"),
});

const signUpSchema = credentialsSchema.extend({
  referralCode: z.string().trim().max(32).optional(),
});

export async function signInAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = credentialsSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Datos incorrectos" };
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);

  if (error) {
    // Mismo mensaje para correo inexistente y contraseña errónea: no se confirma
    // a nadie si una cuenta existe.
    return { error: "Correo o contraseña incorrectos" };
  }

  const next = formData.get("siguiente");
  redirect(typeof next === "string" && next.startsWith("/") ? next : "/");
}

export async function signUpAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = signUpSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
    referralCode: formData.get("ref") ?? undefined,
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Datos incorrectos" };
  }

  const supabase = await createSupabaseServerClient();
  const { NEXT_PUBLIC_SITE_URL } = getPublicEnv();

  const { data, error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: { emailRedirectTo: `${NEXT_PUBLIC_SITE_URL}/verificar` },
  });

  if (error) {
    return { error: "No se ha podido crear la cuenta. Revisa el correo introducido." };
  }

  // RN-12: la atribución se graba en el registro, antes de que exista ningún pago.
  if (data.user && parsed.data.referralCode) {
    await attachReferral(data.user.id, parsed.data.referralCode).catch(() => {
      // Una atribución fallida no puede impedir un registro.
    });
  }

  return {
    notice:
      "Te hemos enviado un correo de verificación. Tus 30 minutos de prueba empiezan cuando lo confirmes.",
  };
}

export async function signOutAction(): Promise<void> {
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
  redirect("/entrar");
}

export async function requestPasswordResetAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const email = z.string().email().safeParse(formData.get("email"));
  if (!email.success) return { error: "Introduce un correo válido" };

  const supabase = await createSupabaseServerClient();
  const { NEXT_PUBLIC_SITE_URL } = getPublicEnv();

  await supabase.auth.resetPasswordForEmail(email.data, {
    redirectTo: `${NEXT_PUBLIC_SITE_URL}/recuperar/nueva`,
  });

  // Respuesta idéntica exista o no la cuenta.
  return { notice: "Si ese correo tiene cuenta, recibirás un enlace para cambiar la contraseña." };
}

export async function updatePasswordAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const password = z
    .string()
    .min(8, "La contraseña necesita al menos 8 caracteres")
    .safeParse(formData.get("password"));

  if (!password.success) {
    return { error: password.error.issues[0]?.message ?? "Contraseña no válida" };
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.updateUser({ password: password.data });

  if (error) return { error: "No se ha podido cambiar la contraseña" };
  return { notice: "Contraseña actualizada." };
}
