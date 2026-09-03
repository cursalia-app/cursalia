import type { Metadata } from "next";
import Link from "next/link";
import { AuthForm, Field } from "@/components/auth/auth-form";
import { requestPasswordResetAction } from "@/lib/actions/auth-actions";

export const metadata: Metadata = { title: "Recuperar contraseña" };

export default function RecoverPage() {
  return (
    <div className="space-y-6">
      <div className="space-y-1.5 text-center">
        <h1 className="text-xl font-semibold tracking-[-0.02em]">Recuperar contraseña</h1>
        <p className="text-[13px] text-muted">Te enviamos un enlace para elegir una nueva.</p>
      </div>

      <AuthForm
        action={requestPasswordResetAction}
        submitLabel="Enviar enlace"
        footer={
          <p className="pt-2 text-center text-[13px] text-subtle">
            <Link href="/entrar" className="underline underline-offset-4 hover:text-muted">
              Volver a entrar
            </Link>
          </p>
        }
      >
        <Field label="Correo" name="email" type="email" autoComplete="email" />
      </AuthForm>
    </div>
  );
}
