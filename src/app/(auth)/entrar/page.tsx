import type { Metadata } from "next";
import Link from "next/link";
import { AuthForm, Field } from "@/components/auth/auth-form";
import { signInAction } from "@/lib/actions/auth-actions";

export const metadata: Metadata = { title: "Entrar" };

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ siguiente?: string }>;
}) {
  const { siguiente } = await searchParams;

  return (
    <div className="space-y-6">
      <div className="space-y-1.5 text-center">
        <h1 className="text-xl font-semibold tracking-[-0.02em]">Entrar</h1>
        <p className="text-[13px] text-muted">Accede a tu catálogo y a tu progreso.</p>
      </div>

      <AuthForm
        action={signInAction}
        submitLabel="Entrar"
        footer={
          <div className="space-y-2 pt-2 text-center text-[13px]">
            <p className="text-subtle">
              No tienes cuenta todavía.{" "}
              <Link href="/registro" className="text-foreground underline underline-offset-4">
                Regístrate
              </Link>
            </p>
            <p>
              <Link
                href="/recuperar"
                className="text-subtle underline underline-offset-4 hover:text-muted"
              >
                He olvidado la contraseña
              </Link>
            </p>
          </div>
        }
      >
        <input type="hidden" name="siguiente" value={siguiente ?? ""} />
        <Field label="Correo" name="email" type="email" autoComplete="email" />
        <Field label="Contraseña" name="password" type="password" autoComplete="current-password" />
      </AuthForm>
    </div>
  );
}
