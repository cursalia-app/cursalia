"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/primitives";
import { Button } from "@/components/ui/button";
import { updateCommissionStatusAction } from "@/lib/actions/admin-actions";
import { formatCents, formatDate } from "@/lib/utils";
import type { AdminCommission } from "@/lib/services/admin-query-service";
import type { CommissionStatus } from "@/lib/types/domain";

const LABEL: Record<CommissionStatus, string> = {
  pending: "Pendiente",
  approved: "Aprobada",
  paid: "Pagada",
  rejected: "Rechazada",
};

const TONE: Record<CommissionStatus, "neutral" | "warn" | "success" | "danger"> = {
  pending: "warn",
  approved: "neutral",
  paid: "success",
  rejected: "danger",
};

/**
 * Comisiones. Se cambia el estado, nunca el importe: quedó congelado al
 * generarse y cambiarlo aquí reescribiría la contabilidad.
 */
export function CommissionTable({ commissions }: { commissions: AdminCommission[] }) {
  if (commissions.length === 0) {
    return (
      <p className="rounded-[10px] border border-dashed border-line px-5 py-12 text-center text-sm text-muted">
        Todavía no se ha generado ninguna comisión.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto rounded-[10px] border border-line">
      <table className="w-full min-w-[720px] text-left text-sm">
        <thead>
          <tr className="border-b border-line bg-card text-[11px] uppercase tracking-wider text-subtle">
            <th className="px-4 py-3 font-medium">Afiliado</th>
            <th className="px-4 py-3 font-medium">Referido</th>
            <th className="px-4 py-3 font-medium">Fecha</th>
            <th className="px-4 py-3 text-right font-medium">Importe</th>
            <th className="px-4 py-3 font-medium">Estado</th>
            <th className="px-4 py-3 text-right font-medium">Acciones</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {commissions.map((commission) => (
            <CommissionRow key={commission.id} commission={commission} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function CommissionRow({ commission }: { commission: AdminCommission }) {
  const router = useRouter();
  const [status, setStatus] = React.useState(commission.status);
  const [pending, startTransition] = React.useTransition();

  const change = (next: CommissionStatus) =>
    startTransition(async () => {
      const previous = status;
      setStatus(next);
      const result = await updateCommissionStatusAction({ id: commission.id, status: next });
      if (!result.ok) setStatus(previous);
      else router.refresh();
    });

  return (
    <tr className="bg-background/40">
      <td className="num px-4 py-3 text-[12px]">{commission.affiliateEmail}</td>
      <td className="num px-4 py-3 text-[12px] text-muted">{commission.referredEmail}</td>
      <td className="num px-4 py-3 text-[12px] text-subtle">{formatDate(commission.createdAt)}</td>
      <td className="num px-4 py-3 text-right text-[13px]">{formatCents(commission.amountCents)}</td>
      <td className="px-4 py-3">
        <Badge tone={TONE[status]}>{LABEL[status]}</Badge>
      </td>
      <td className="px-4 py-3">
        <div className="flex justify-end gap-1">
          {status !== "approved" && status !== "paid" ? (
            <Button variant="ghost" size="sm" disabled={pending} onClick={() => change("approved")}>
              Aprobar
            </Button>
          ) : null}
          {status !== "paid" ? (
            <Button variant="secondary" size="sm" disabled={pending} onClick={() => change("paid")}>
              Marcar pagada
            </Button>
          ) : null}
          {status !== "rejected" && status !== "paid" ? (
            <Button variant="ghost" size="sm" disabled={pending} onClick={() => change("rejected")}>
              Rechazar
            </Button>
          ) : null}
        </div>
      </td>
    </tr>
  );
}
