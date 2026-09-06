import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight, Monitor } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import {
  Badge,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Separator,
} from "@/components/ui/primitives";
import { signOutAction } from "@/lib/actions/auth-actions";
import { getSubscriptionState } from "@/lib/services/billing-service";
import { listDevices } from "@/lib/services/device-service";
import { getSetting } from "@/lib/services/settings-service";
import { getAccessState } from "@/lib/services/access-service";
import { getCurrentProfile } from "@/lib/supabase/server";
import { formatDate } from "@/lib/utils";
import { redirect } from "next/navigation";

export const metadata: Metadata = { title: "Cuenta" };

export default async function AccountPage() {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/entrar");

  const [subscription, devices, maxDevices, access, graceDays] = await Promise.all([
    getSubscriptionState(profile.id),
    listDevices(profile.id),
    getSetting("max_devices"),
    getAccessState(profile.id),
    getSetting("grace_period_days"),
  ]);

  return (
    <div className="max-w-2xl space-y-6">
      <PageHeader
        title="Tu cuenta"
        description="Estado de la suscripción, acceso y datos personales."
      />

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-3">
            <CardTitle>Acceso</CardTitle>
            {subscription?.isActive ? (
              <Badge tone="success">Activo</Badge>
            ) : subscription?.status === "past_due" ? (
              <Badge tone="warn">Impago</Badge>
            ) : access.kind === "trial" ? (
              <Badge tone="outline">Prueba en curso</Badge>
            ) : (
              <Badge tone="danger">Sin acceso</Badge>
            )}
          </div>
          <CardDescription>
            {subscription?.status === "active" && subscription.currentPeriodEnd
              ? `Tienes acceso hasta el ${formatDate(subscription.currentPeriodEnd)}. Cuando se acerque la fecha, contacta con nosotros para renovar y evitar que se corte.`
              : subscription?.status === "past_due"
                ? `Aún no hemos confirmado tu último pago. Tienes ${graceDays} días de cortesía antes de perder el acceso.`
                : access.kind === "trial"
                  ? "Estás en la prueba gratuita. Cuando termine, escríbenos para activar tu cuenta mensual."
                  : "Tu acceso está cerrado. Tu progreso sigue guardado. Contacta con soporte para reactivarlo."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild variant="secondary" size="sm">
            <a href="mailto:soporte@cursalia.com?subject=Renovar%20mi%20acceso">
              Contactar para renovar
            </a>
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Acceso</CardTitle>
          <CardDescription>Correo y contraseña de entrada a Cursalia.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-[11px] uppercase tracking-wider text-subtle" htmlFor="email">
              Correo
            </label>
            <input
              id="email"
              readOnly
              value={profile.email}
              className="num w-full rounded-[10px] border border-line bg-background px-3 py-2.5 text-[13px] text-muted outline-none"
            />
          </div>

          <Separator />

          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-sm">Contraseña</p>
              <p className="text-[12px] text-subtle">Te enviaremos un correo para confirmarlo.</p>
            </div>
            <Button asChild variant="secondary" size="sm">
              <Link href="/recuperar">Cambiar</Link>
            </Button>
          </div>

          <Separator />

          <form action={signOutAction}>
            <Button type="submit" variant="ghost" size="sm">
              Cerrar sesión
            </Button>
          </form>
        </CardContent>
      </Card>

      <Link
        href="/cuenta/dispositivos"
        className="flex items-center gap-4 rounded-[10px] border border-line bg-card p-5 transition-colors hover:border-line-strong"
      >
        <Monitor className="size-4 shrink-0 text-muted" strokeWidth={1.75} />
        <div className="flex-1">
          <p className="text-sm font-medium">Dispositivos</p>
          <p className="num text-[12px] text-subtle">
            {devices.length} de {maxDevices} registrados
          </p>
        </div>
        <ChevronRight className="size-4 text-subtle" strokeWidth={1.75} />
      </Link>

      {profile.isAdmin ? (
        <Link
          href="/admin"
          className="flex items-center gap-4 rounded-[10px] border border-line bg-card p-5 transition-colors hover:border-line-strong"
        >
          <div className="flex-1">
            <p className="text-sm font-medium">Panel de administración</p>
            <p className="text-[12px] text-subtle">Gestionar catálogo, usuarios y ajustes.</p>
          </div>
          <ChevronRight className="size-4 text-subtle" strokeWidth={1.75} />
        </Link>
      ) : null}

      <Card className="border-danger/25">
        <CardHeader>
          <CardTitle className="text-danger">Eliminar la cuenta</CardTitle>
          <CardDescription>
            Escríbenos y anonimizamos tus datos. Perderás el acceso y no se puede deshacer.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild variant="danger" size="sm">
            <a href="mailto:soporte@cursalia.com?subject=Eliminar%20mi%20cuenta">
              Solicitar eliminación
            </a>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
