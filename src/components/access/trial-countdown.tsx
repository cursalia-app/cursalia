"use client";

import Link from "next/link";
import { formatClock, useRemainingMs } from "@/lib/hooks/use-clock";
import { cn } from "@/lib/utils";
import type { AccessState } from "@/lib/types/domain";

/** Por debajo de este umbral el contador pasa a tono de aviso. */
const URGENT_MS = 5 * 60 * 1000;

/**
 * Los 30 minutos de prueba son el elemento más singular del producto: se tratan
 * como un cronómetro visible, no como un aviso pasajero.
 * El navegador NUNCA decide el acceso (RN-14): esto solo informa.
 */
export function TrialCountdown({ endsAt, className }: { endsAt: string; className?: string }) {
  const ms = useRemainingMs(endsAt);
  const expired = ms !== null && ms === 0;
  const urgent = ms !== null && ms > 0 && ms < URGENT_MS;

  return (
    <div
      className={cn(
        "rounded-[10px] border p-3",
        expired
          ? "border-danger/30 bg-danger/[0.06]"
          : urgent
            ? "border-warn/30 bg-warn/[0.06]"
            : "border-line bg-card",
        className,
      )}
    >
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[11px] font-medium uppercase tracking-wider text-subtle">
          {expired ? "Prueba finalizada" : "Prueba gratuita"}
        </span>
        <span
          className={cn(
            "num text-sm",
            expired ? "text-danger" : urgent ? "text-warn" : "text-foreground",
          )}
        >
          {ms === null ? "--:--" : formatClock(ms)}
        </span>
      </div>

      <p className="mt-1.5 text-xs leading-relaxed text-muted">
        {expired
          ? "Contáctanos para activar tu cuenta. Tu progreso se conserva."
          : "Acceso completo al catálogo mientras corre el reloj."}
      </p>

      <Link
        href="/cuenta"
        className="mt-3 inline-flex h-8 w-full items-center justify-center rounded-lg bg-primary px-3 text-[13px] font-medium text-primary-foreground transition-colors hover:bg-white"
      >
        {expired ? "Solicitar acceso" : "Ver mi cuenta"}
      </Link>
    </div>
  );
}

/** Versión compacta para la barra superior y el pie de la barra lateral. */
export function AccessChip({ access }: { access: AccessState }) {
  const ms = useRemainingMs(access.kind === "trial" ? access.trialEndsAt : null);

  if (access.kind === "subscribed") {
    return <span className="text-[11px] font-medium text-subtle">Acceso activo</span>;
  }

  if (access.kind === "grace") {
    return (
      <span className="rounded-full border border-warn/30 bg-warn/10 px-2 py-0.5 text-[11px] text-warn">
        Pendiente de pago
      </span>
    );
  }

  if (access.kind === "none") {
    return (
      <Link href="/cuenta" className="text-[11px] font-medium text-foreground underline underline-offset-4">
        Solicitar acceso
      </Link>
    );
  }

  const expired = ms !== null && ms === 0;
  const urgent = ms !== null && ms > 0 && ms < URGENT_MS;

  return (
    <span
      className={cn(
        "num rounded-full border px-2 py-0.5 text-[11px]",
        expired
          ? "border-danger/30 bg-danger/10 text-danger"
          : urgent
            ? "border-warn/30 bg-warn/10 text-warn"
            : "border-line bg-elevated text-muted",
      )}
    >
      {expired ? "Prueba fin." : `Prueba ${ms === null ? "--:--" : formatClock(ms)}`}
    </span>
  );
}
