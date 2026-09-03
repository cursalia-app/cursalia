import Link from "next/link";
import { Check, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatCents } from "@/lib/utils";

/**
 * Pantalla que ve quien no tiene acceso. Es una pantalla diseñada, nunca un error
 * técnico: quien llega aquí es un cliente potencial, no un fallo.
 */
export function Paywall({
  title = "Este contenido requiere suscripción",
  reason = "trial_ended",
  priceCents = 2900,
}: {
  title?: string;
  reason?: "trial_ended" | "no_trial" | "past_due" | "canceled";
  priceCents?: number;
}) {
  const copy: Record<typeof reason, string> = {
    trial_ended:
      "Tus 30 minutos de prueba han terminado. Todo tu progreso sigue guardado: al suscribirte retomas exactamente donde lo dejaste.",
    no_trial: "Empieza tu prueba gratuita de 30 minutos y accede al catálogo completo sin restricciones.",
    past_due:
      "No hemos podido cobrar tu último recibo. Actualiza el método de pago para recuperar el acceso.",
    canceled: "Tu suscripción ya no está activa. Reactívala para volver a entrar al catálogo.",
  };

  return (
    <div className="relative isolate flex min-h-[70vh] items-center justify-center px-4 py-12">
      {/* El catálogo se intuye detrás, desenfocado: recuerda lo que hay al otro lado. */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10 overflow-hidden opacity-40 blur-[6px]">
        <div className="grid grid-cols-2 gap-4 p-6 sm:grid-cols-3 lg:grid-cols-4">
          {Array.from({ length: 12 }, (_, i) => (
            <div key={i} className="aspect-video rounded-[10px] border border-line bg-card" />
          ))}
        </div>
        <div className="absolute inset-0 bg-gradient-to-b from-background/60 via-background/85 to-background" />
      </div>

      <div className="w-full max-w-md rounded-[10px] border border-line bg-card p-7 text-center">
        <span className="mx-auto flex size-11 items-center justify-center rounded-full border border-line bg-elevated">
          <Lock className="size-4 text-muted" strokeWidth={1.75} />
        </span>

        <h1 className="mt-5 text-xl font-semibold tracking-[-0.02em]">{title}</h1>
        <p className="mx-auto mt-2.5 max-w-sm text-sm leading-relaxed text-muted">{copy[reason]}</p>

        <ul className="mt-6 space-y-2.5 text-left">
          {[
            "Todo el catálogo de cursos, sin comprar nada suelto",
            "Biblioteca de libros con marcapáginas",
            "Hasta 4 dispositivos por cuenta",
            "Cancelas cuando quieras",
          ].map((feature) => (
            <li key={feature} className="flex items-start gap-2.5 text-[13px] text-muted">
              <Check className="mt-0.5 size-3.5 shrink-0 text-success" strokeWidth={2.5} />
              {feature}
            </li>
          ))}
        </ul>

        <div className="mt-7 space-y-3">
          <Button asChild variant="primary" size="lg" className="w-full">
            <Link href="/cuenta">
              Suscribirme por <span className="num ml-1">{formatCents(priceCents)}</span>
              <span className="text-primary-foreground/60">/mes</span>
            </Link>
          </Button>
          <Link href="/cursos" className="block text-[13px] text-subtle underline underline-offset-4 hover:text-muted">
            Volver al catálogo
          </Link>
        </div>
      </div>
    </div>
  );
}
