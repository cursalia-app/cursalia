import type { Metadata } from "next";
import { PageHeader } from "@/components/layout/page-header";
import { CommissionTable } from "@/components/admin/commission-table";
import { Stat } from "@/components/ui/stat";
import { listCommissionsForAdmin } from "@/lib/services/admin-query-service";
import { formatCents } from "@/lib/utils";

export const metadata: Metadata = { title: "Comisiones" };

export default async function AdminCommissionsPage() {
  const commissions = await listCommissionsForAdmin();

  const pending = commissions.filter((c) => c.status === "pending" || c.status === "approved");
  const paid = commissions.filter((c) => c.status === "paid");

  return (
    <div className="space-y-6">
      <PageHeader
        title="Comisiones"
        description="El importe quedó congelado al generarse. Aquí solo se cambia el estado."
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <Stat label="Por pagar" value={formatCents(pending.reduce((a, c) => a + c.amountCents, 0))} />
        <Stat label="Pagado" value={formatCents(paid.reduce((a, c) => a + c.amountCents, 0))} />
        <Stat label="Total generadas" value={String(commissions.length)} />
      </div>

      <CommissionTable commissions={commissions} />
    </div>
  );
}
