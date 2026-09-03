import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/layout/page-header";
import { Stat } from "@/components/ui/stat";
import { Card } from "@/components/ui/primitives";
import { listAuditEntries } from "@/lib/services/audit-service";
import {
  listBooksForAdmin,
  listCategoriesForAdmin,
  listCommissionsForAdmin,
  listCoursesForAdmin,
} from "@/lib/services/admin-query-service";
import { formatDate } from "@/lib/utils";

export const metadata: Metadata = { title: "Panel" };

export default async function AdminHomePage() {
  const [categories, courses, books, commissions, audit] = await Promise.all([
    listCategoriesForAdmin(),
    listCoursesForAdmin(),
    listBooksForAdmin(),
    listCommissionsForAdmin(),
    listAuditEntries({ limit: 12 }),
  ]);

  const published = courses.filter((course) => course.status === "published").length;
  const pending = commissions.filter((c) => c.status === "pending").length;

  return (
    <div className="space-y-8">
      <PageHeader title="Panel" description="Estado del catálogo y últimos cambios." />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Cursos" value={String(courses.length)} hint={`${published} publicados`} />
        <Stat label="Categorías" value={String(categories.length)} />
        <Stat label="Libros" value={String(books.length)} />
        <Stat label="Comisiones" value={String(commissions.length)} hint={`${pending} pendientes`} />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { href: "/admin/cursos", label: "Gestionar cursos" },
          { href: "/admin/importar", label: "Importar desde Drive" },
          { href: "/admin/libros", label: "Añadir un libro" },
          { href: "/admin/ajustes", label: "Cambiar ajustes" },
        ].map((action) => (
          <Link
            key={action.href}
            href={action.href}
            className="rounded-[10px] border border-line bg-card px-4 py-3 text-[13px] transition-colors hover:border-line-strong"
          >
            {action.label}
          </Link>
        ))}
      </div>

      <section>
        <h2 className="mb-3 text-[13px] font-medium uppercase tracking-wider text-subtle">
          Últimos cambios
        </h2>
        <Card className="divide-y divide-line">
          {audit.length === 0 ? (
            <p className="px-5 py-10 text-center text-sm text-muted">
              Todavía no hay actividad registrada.
            </p>
          ) : (
            audit.map((entry) => (
              <div key={entry.id} className="flex flex-wrap items-center gap-3 px-5 py-3 text-[13px]">
                <span className="num text-[11px] text-subtle">{formatDate(entry.createdAt)}</span>
                <span className="text-foreground">{entry.action}</span>
                <span className="text-subtle">{entry.entityType}</span>
              </div>
            ))
          )}
        </Card>
      </section>
    </div>
  );
}
