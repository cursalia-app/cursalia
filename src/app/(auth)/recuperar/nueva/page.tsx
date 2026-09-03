import type { Metadata } from "next";
import { AuthForm, Field } from "@/components/auth/auth-form";
import { updatePasswordAction } from "@/lib/actions/auth-actions";

export const metadata: Metadata = { title: "Nueva contraseña" };

export default function NewPasswordPage() {
  return (
    <div className="space-y-6">
      <div className="space-y-1.5 text-center">
        <h1 className="text-xl font-semibold tracking-[-0.02em]">Nueva contraseña</h1>
        <p className="text-[13px] text-muted">Elige una contraseña y vuelve a entrar.</p>
      </div>

      <AuthForm action={updatePasswordAction} submitLabel="Guardar contraseña">
        <Field
          label="Contraseña"
          name="password"
          type="password"
          autoComplete="new-password"
          hint="Mínimo 8 caracteres."
        />
      </AuthForm>
    </div>
  );
}
