import type { Metadata } from "next";
import Link from "next/link";
import { AuthForm, Field } from "@/components/auth/auth-form";
import { signUpAction } from "@/lib/actions/auth-actions";

export const metadata: Metadata = { title: "Crear cuenta" };

export default async function SignUpPage({
  searchParams,
}: {
  searchParams: Promise<{ ref?: string }>;
}) {
  const { ref } = await searchParams;

  return (
    <div className="space-y-6">
      <div className="space-y-1.5 text-center">
        <h1 className="text-xl font-semibold tracking-[-0.02em]">Crear cuenta</h1>
        <p className="text-[13px] text-muted">
          30 minutos de catálogo completo, gratis. Sin tarjeta.
        </p>
      </div>

      <AuthForm
        action={signUpAction}
        submitLabel="Crear cuenta"
        footer={
          <p className="pt-2 text-center text-[13px] text-subtle">
            Ya tienes cuenta.{" "}
            <Link href="/entrar" className="text-foreground underline underline-offset-4">
              Entrar
            </Link>
          </p>
        }
      >
        {/* La atribución del afiliado viaja hasta aquí y se graba al registrar (RN-12). */}
        <input type="hidden" name="ref" value={ref ?? ""} />
        <Field label="Correo" name="email" type="email" autoComplete="email" />
        <Field
          label="Contraseña"
          name="password"
          type="password"
          autoComplete="new-password"
          hint="Mínimo 8 caracteres."
        />
        {ref ? (
          <p className="rounded-lg border border-line bg-card px-3 py-2 text-[12px] text-muted">
            Te ha invitado un afiliado. Su código se aplicará a tu registro.
          </p>
        ) : null}
      </AuthForm>
    </div>
  );
}
