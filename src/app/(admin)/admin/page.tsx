import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/layout/page-header";
import { Stat } from "@/components/ui/stat";
import { Card } from "@/components/ui/primitives";
import { ExpiringPanel } from "@/components/admin/expiring-panel";
import { listAuditEntries } from "@/lib/services/audit-service";
import {
  getAdminMetrics,
  listBooksForAdmin,
  listCategoriesForAdmin,
  listCommissionsForAdmin,
  listCoursesForAdmin,
  listUpcomingExpirations,
} from "@/lib/services/admin-query-service";
import { formatCents, formatDate } from "@/lib/utils";

export const metadata: Metadata = { title: "Panel" };

/** Traducciones legibles de los tipos de acción que registran los servicios. */
const ACTION_LABELS: Record<string, string> = {
  reorder: "Reordenó",
  change_status: "Cambió estado",
  payment_recorded: "Pago registrado",
  subscription_updated: "Suscripción actualizada",
  trial_blocked_ip_reuse: "Trial bloqueado (IP repetida)",
  access_extended: "Acceso extendido",
  access_revoked: "Acceso cortado",
};

const ENTITY_LABELS: Record<string, string> = {
  category: "categoría",
  course: "curso",
  module: "tema",
  lesson: "capítulo",
  book: "libro",
  payment: "pago",
  subscription: "suscripción",
  profile: "perfil",
};

export default async function AdminHomePage() {
  const [metrics, categories, courses, books, commissions, audit, expiring] = await Promise.all([
    getAdminMetrics(),
    listCategoriesForAdmin(),
    listCoursesForAdmin(),
    listBooksForAdmin(),
    listCommissionsForAdmin(),
    listAuditEntries({ limit: 12 }),
    listUpcomingExpirations(7),
  ]);

  const published = courses.filter((course) => course.status === "published").length;
  const pendingCommissions = commissions.filter((c) => c.status === "pending").length;

  return (
    <div className="space-y-10">
      <PageHeader title="Panel" description="Vista de conjunto de la plataforma." />

      {/* Métricas del negocio: personas, ingresos, actividad. */}
      <section className="space-y-3">
        <h2 className="text-[11px] font-medium uppercase tracking-wider text-subtle">Negocio</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Stat
            label="Usuarios"
            value={String(metrics.totalUsers)}
            hint={`${metrics.signupsLast30Days} altas en 30 días`}
          />
          <Stat
            label="Suscripciones activas"
            value={String(metrics.activeSubscriptions)}
            hint={`${metrics.onTrial} en prueba ahora`}
          />
          <Stat
            label="Ingresos 30 días"
            value={formatCents(metrics.revenueLast30DaysCents)}
            hint={`${metrics.paymentsLast30Days} pagos`}
          />
          <Stat
            label="Comisiones"
            value={String(commissions.length)}
            hint={`${pendingCommissions} pendientes`}
          />
        </div>
      </section>

      {/* Estado del catálogo: cuánto hay, cuánto vive publicado. */}
      <section className="space-y-3">
        <h2 className="text-[11px] font-medium uppercase tracking-wider text-subtle">Catálogo</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Stat label="Cursos" value={String(courses.length)} hint={`${published} publicados`} />
          <Stat label="Categorías" value={String(categories.length)} />
          <Stat label="Libros" value={String(books.length)} />
        </div>
      </section>

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
        <div className="mb-3 flex items-baseline justify-between gap-3">
          <h2 className="text-[13px] font-medium uppercase tracking-wider text-subtle">
            Vencimientos de acceso
          </h2>
          <Link
            href="/admin/usuarios"
            className="text-[12px] text-muted hover:text-foreground"
          >
            Ver todos los usuarios
          </Link>
        </div>
        <ExpiringPanel items={expiring} />
      </section>

      <div className="grid gap-8 lg:grid-cols-2">
        <section>
          <h2 className="mb-3 text-[13px] font-medium uppercase tracking-wider text-subtle">
            Cursos con más gente
          </h2>
          <Card className="divide-y divide-line">
            {metrics.topCourses.length === 0 ? (
              <p className="px-5 py-10 text-center text-sm text-muted">
                Todavía no hay alumnado.
              </p>
            ) : (
              metrics.topCourses.map((course) => (
                <Link
                  key={course.id}
                  href={`/admin/cursos/${course.id}`}
                  className="flex items-center justify-between gap-3 px-5 py-3 text-[13px] transition-colors hover:bg-card/60"
                >
                  <span className="min-w-0 flex-1 truncate">{course.title}</span>
                  <span className="num text-[12px] text-subtle">
                    {course.learners} {course.learners === 1 ? "alumno" : "alumnos"}
                  </span>
                </Link>
              ))
            )}
          </Card>
        </section>

        <section>
          <h2 className="mb-3 text-[13px] font-medium uppercase tracking-wider text-subtle">
            Libros más leídos
          </h2>
          <Card className="divide-y divide-line">
            {metrics.topBooks.length === 0 ? (
              <p className="px-5 py-10 text-center text-sm text-muted">
                Nadie ha abierto un libro todavía.
              </p>
            ) : (
              metrics.topBooks.map((book) => (
                <div
                  key={book.id}
                  className="flex items-center justify-between gap-3 px-5 py-3 text-[13px]"
                >
                  <span className="min-w-0 flex-1 truncate">{book.title}</span>
                  <span className="num text-[12px] text-subtle">
                    {book.readers} {book.readers === 1 ? "lector" : "lectores"}
                  </span>
                </div>
              ))
            )}
          </Card>
        </section>
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
              <div
                key={entry.id}
                className="flex flex-wrap items-center gap-3 px-5 py-3 text-[13px]"
              >
                <span className="num shrink-0 text-[11px] text-subtle">
                  {formatDate(entry.createdAt)}
                </span>
                <span className="text-foreground">
                  {ACTION_LABELS[entry.action] ?? entry.action}
                </span>
                <span className="text-subtle">
                  {ENTITY_LABELS[entry.entityType] ?? entry.entityType}
                </span>
              </div>
            ))
          )}
        </Card>
      </section>
    </div>
  );
}
