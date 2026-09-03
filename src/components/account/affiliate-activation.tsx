"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/primitives";
import { activateAffiliateAction } from "@/lib/actions/learner-actions";
import { formatCents } from "@/lib/utils";

/**
 * Activación de la faceta de afiliado.
 * Solo se ofrece a quien tiene la suscripción activa (RN-10); si alguien llega
 * aquí sin ella, el servicio lo rechaza y se explica por qué.
 */
export function AffiliateActivation({ commissionCents }: { commissionCents: number }) {
  const router = useRouter();
  const [error, setError] = React.useState<string | null>(null);
  const [pending, startTransition] = React.useTransition();

  const activate = () =>
    startTransition(async () => {
      const result = await activateAffiliateAction();
      setError(result.ok ? null : (result.message ?? "No se ha podido activar."));
      if (result.ok) router.refresh();
    });

  return (
    <Card className="max-w-lg p-7">
      <h2 className="text-base font-medium tracking-[-0.01em]">Activa tu enlace de afiliado</h2>
      <p className="mt-2 text-sm leading-relaxed text-muted">
        Comparte Cursalia con quien creas que le sirve. Cuando alguien se registre con tu enlace y
        haga su pago de entrada, se genera tu comisión de{" "}
        <span className="num text-foreground">{formatCents(commissionCents)}</span>.
      </p>

      <ul className="mt-5 space-y-2 text-[13px] text-muted">
        <li>Una sola comisión por persona, sobre su pago de entrada.</li>
        <li>El importe se congela al generarse: no cambia después.</li>
        <li>Las mensualidades de tus referidos no generan comisión.</li>
      </ul>

      <div className="mt-6 flex items-center gap-3">
        <Button variant="primary" size="lg" onClick={activate} disabled={pending}>
          {pending ? "Activando…" : "Activar afiliados"}
        </Button>
        {error ? <span className="text-[12px] text-danger">{error}</span> : null}
      </div>
    </Card>
  );
}
