import type { Metadata } from "next";
import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/primitives";
import { AccessActions } from "@/components/admin/access-actions";
import { listUsersForAdmin } from "@/lib/services/admin-query-service";
import { getCurrentProfile } from "@/lib/supabase/server";
import { formatDate } from "@/lib/utils";

export const metadata: Metadata = { title: "Usuarios" };

export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  const [users, profile] = await Promise.all([listUsersForAdmin(q), getCurrentProfile()]);
  const currentUserId = profile?.id ?? null;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Usuarios"
        description="Estado del acceso y dispositivos. Cada usuario se puede extender o cortar desde aquí."
      />

      <form className="flex gap-2">
        <input
          name="q"
          defaultValue={q ?? ""}
          placeholder="Buscar por correo"
          aria-label="Buscar por correo"
          className="min-w-0 flex-1 rounded-[10px] border border-line bg-card px-3 py-2.5 text-sm outline-none placeholder:text-subtle focus:border-line-strong"
        />
        <button
          type="submit"
          className="rounded-[10px] border border-line bg-elevated px-4 text-sm hover:border-line-strong"
        >
          Buscar
        </button>
      </form>

      <div className="overflow-x-auto rounded-[10px] border border-line">
        <table className="w-full min-w-[960px] text-left text-sm">
          <thead>
            <tr className="border-b border-line bg-card text-[11px] uppercase tracking-wider text-subtle">
              <th className="px-4 py-3 font-medium">Correo</th>
              <th className="px-4 py-3 font-medium">Alta</th>
              <th className="px-4 py-3 font-medium">Acceso</th>
              <th className="px-4 py-3 font-medium">Prueba</th>
              <th className="px-4 py-3 font-medium">IP</th>
              <th className="px-4 py-3 text-right font-medium">Disp.</th>
              <th className="px-4 py-3 text-right font-medium">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {users.map((user) => (
              <tr key={user.id} className="bg-background/40">
                <td className="num px-4 py-3 text-[12px]">
                  {user.email}
                  {user.isAdmin ? (
                    <Badge tone="outline" className="ml-2">
                      Admin
                    </Badge>
                  ) : null}
                </td>
                <td className="num px-4 py-3 text-[12px] text-subtle">
                  {formatDate(user.createdAt)}
                </td>
                <td className="px-4 py-3">
                  <AccessCell
                    status={user.subscriptionStatus}
                    currentPeriodEnd={user.currentPeriodEnd}
                    isExpired={user.isAccessExpired}
                  />
                </td>
                <td className="px-4 py-3">
                  {user.trialStatus === "active" ? (
                    <Badge tone="success">En curso</Badge>
                  ) : user.trialStatus === "expired" ? (
                    <Badge tone="neutral">Consumida</Badge>
                  ) : (
                    <span className="text-[12px] text-subtle">No iniciada</span>
                  )}
                </td>
                <td className="num px-4 py-3 text-[12px] text-subtle">{user.signupIp ?? "—"}</td>
                <td className="num px-4 py-3 text-right text-[12px]">{user.deviceCount}</td>
                <td className="px-4 py-3">
                  <div className="flex justify-end">
                    <AccessActions
                      userId={user.id}
                      hasSubscription={user.subscriptionStatus !== null}
                      isAdmin={user.isAdmin}
                      isSelf={user.id === currentUserId}
                      isDeleted={user.deletedAt !== null}
                    />
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {users.length === 0 ? (
          <p className="px-5 py-12 text-center text-sm text-muted">Ningún usuario coincide.</p>
        ) : null}
      </div>
    </div>
  );
}

/**
 * Celda de acceso: pinta activo con la fecha exacta, o el estado alternativo.
 * "Activo pero con fecha ya en el pasado" se marca en rojo aunque el status
 * siga siendo 'active': significa que el admin no ha renovado a tiempo.
 */
function AccessCell({
  status,
  currentPeriodEnd,
  isExpired,
}: {
  status: "active" | "past_due" | "canceled" | "expired" | null;
  currentPeriodEnd: string | null;
  isExpired: boolean;
}) {
  if (status === "active" && currentPeriodEnd) {
    return (
      <div className="space-y-0.5">
        <Badge tone={isExpired ? "danger" : "success"}>{isExpired ? "Caducado" : "Activo"}</Badge>
        <p className="num text-[11px] text-subtle">Hasta {formatDate(currentPeriodEnd)}</p>
      </div>
    );
  }

  if (status === "past_due") return <Badge tone="warn">Impago</Badge>;
  if (status === "canceled") return <Badge tone="neutral">Cancelado</Badge>;
  if (status === "expired") return <Badge tone="neutral">Caducado</Badge>;
  return <span className="text-[12px] text-subtle">Sin acceso</span>;
}
