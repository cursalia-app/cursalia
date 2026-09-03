import type { Metadata } from "next";
import { PageHeader } from "@/components/layout/page-header";
import { AffiliateActivation } from "@/components/account/affiliate-activation";
import { CopyField } from "@/components/ui/copy-field";
import { Stat } from "@/components/ui/stat";
import { Badge, Card, EmptyState } from "@/components/ui/primitives";
import { getAffiliateDashboard } from "@/lib/services/affiliate-service";
import { getSetting } from "@/lib/services/settings-service";
import { getPublicEnv } from "@/lib/env";
import { requireCurrentUserId } from "@/lib/supabase/server";
import { formatCents, formatDate } from "@/lib/utils";
import type { CommissionStatus } from "@/lib/types/domain";

export const metadata: Metadata = { title: "Afiliados" };

const STATUS_LABEL: Record<CommissionStatus, string> = {
  pending: "Pendiente",
  approved: "Aprobada",
  paid: "Pagada",
  rejected: "Rechazada",
};

const STATUS_TONE: Record<CommissionStatus, "neutral" | "warn" | "success" | "danger"> = {
  pending: "warn",
  approved: "neutral",
  paid: "success",
  rejected: "danger",
};

export default async function AffiliatesPage() {
  const userId = await requireCurrentUserId();
  const { NEXT_PUBLIC_SITE_URL } = getPublicEnv();

  const [dashboard, commissionCents] = await Promise.all([
    getAffiliateDashboard(userId, NEXT_PUBLIC_SITE_URL),
    getSetting("entry_commission_cents"),
  ]);

  if (!dashboard) {
    return (
      <div>
        <PageHeader
          title="Afiliados"
          description="Gana una comisión fija por cada persona que traigas a Cursalia."
        />
        <AffiliateActivation commissionCents={commissionCents} />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <PageHeader
        title="Afiliados"
        description="Comparte tu enlace. Cuando alguien se registra con él y hace su pago de entrada, se genera tu comisión."
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <Stat
          label="Cobrado"
          value={formatCents(dashboard.totalEarnedCents)}
          hint="Comisiones ya pagadas"
        />
        <Stat
          label="Pendiente"
          value={formatCents(dashboard.totalPendingCents)}
          hint="Aprobadas o en revisión"
        />
        <Stat
          label="Referidos"
          value={String(dashboard.referrals.length)}
          hint="Registros con tu código"
        />
      </div>

      <Card className="p-5">
        <div className="grid gap-4 sm:grid-cols-[1fr_auto] sm:items-end">
          <CopyField label="Tu enlace de invitación" value={dashboard.link} />
          <CopyField label="Código" value={dashboard.code} className="sm:w-44" />
        </div>
        <p className="mt-4 text-[12px] leading-relaxed text-subtle">
          La atribución se graba en el momento del registro y ya no cambia. La comisión es una
          cantidad fija que se congela al generarse: si más adelante cambia el importe, tus
          comisiones anteriores no se tocan.
        </p>
      </Card>

      <section>
        <h2 className="mb-4 text-[13px] font-medium uppercase tracking-wider text-subtle">
          Tus referidos
        </h2>

        {dashboard.referrals.length === 0 ? (
          <EmptyState
            title="Todavía no tienes referidos"
            description="Comparte tu enlace. Aquí verás quién se registra y en qué estado está cada comisión."
          />
        ) : (
          <div className="overflow-x-auto rounded-[10px] border border-line">
            <table className="w-full min-w-[560px] text-left text-sm">
              <thead>
                <tr className="border-b border-line bg-card text-[11px] uppercase tracking-wider text-subtle">
                  <th className="px-4 py-3 font-medium">Usuario</th>
                  <th className="hidden px-4 py-3 font-medium sm:table-cell">Registro</th>
                  <th className="px-4 py-3 font-medium">Estado</th>
                  <th className="px-4 py-3 text-right font-medium">Comisión</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {dashboard.referrals.map((referral) => (
                  <tr key={referral.id} className="bg-background/40">
                    <td className="num px-4 py-3 text-[13px] text-foreground">
                      {referral.maskedEmail}
                    </td>
                    <td className="num hidden px-4 py-3 text-[12px] text-muted sm:table-cell">
                      {formatDate(referral.signedUpAt)}
                    </td>
                    <td className="px-4 py-3">
                      {referral.commissionStatus ? (
                        <Badge tone={STATUS_TONE[referral.commissionStatus]}>
                          {STATUS_LABEL[referral.commissionStatus]}
                        </Badge>
                      ) : (
                        <span className="text-[12px] text-subtle">Sin pago aún</span>
                      )}
                    </td>
                    <td className="num px-4 py-3 text-right text-[13px] text-foreground">
                      {referral.commissionCents === null
                        ? "—"
                        : formatCents(referral.commissionCents)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
