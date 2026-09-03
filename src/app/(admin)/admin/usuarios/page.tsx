import type { Metadata } from "next";
import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/primitives";
import { listUsersForAdmin } from "@/lib/services/admin-query-service";
import { formatDate } from "@/lib/utils";

export const metadata: Metadata = { title: "Usuarios" };

export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  const users = await listUsersForAdmin(q);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Usuarios"
        description="Estado de suscripción y dispositivos. Para dar soporte, no para vigilar."
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
        <table className="w-full min-w-[680px] text-left text-sm">
          <thead>
            <tr className="border-b border-line bg-card text-[11px] uppercase tracking-wider text-subtle">
              <th className="px-4 py-3 font-medium">Correo</th>
              <th className="px-4 py-3 font-medium">Alta</th>
              <th className="px-4 py-3 font-medium">Suscripción</th>
              <th className="px-4 py-3 font-medium">Prueba</th>
              <th className="px-4 py-3 text-right font-medium">Dispositivos</th>
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
                <td className="num px-4 py-3 text-[12px] text-subtle">{formatDate(user.createdAt)}</td>
                <td className="px-4 py-3">
                  {user.subscriptionStatus === "active" ? (
                    <Badge tone="success">Activa</Badge>
                  ) : user.subscriptionStatus === "past_due" ? (
                    <Badge tone="warn">Impago</Badge>
                  ) : user.subscriptionStatus ? (
                    <Badge tone="danger">{user.subscriptionStatus}</Badge>
                  ) : (
                    <span className="text-[12px] text-subtle">Sin suscripción</span>
                  )}
                </td>
                <td className="num px-4 py-3 text-[12px] text-subtle">
                  {user.trialStartedAt ? formatDate(user.trialStartedAt) : "No iniciada"}
                </td>
                <td className="num px-4 py-3 text-right text-[12px]">{user.deviceCount}</td>
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
