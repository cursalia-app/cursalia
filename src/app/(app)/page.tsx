import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { ContinueCard } from "@/components/catalog/continue-card";
import { CourseCard } from "@/components/catalog/course-card";
import { Rail } from "@/components/catalog/rail";
import { PageHeader, SectionHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/ui/primitives";
import { listNewReleases } from "@/lib/services/catalog-service";
import { getContinueItems } from "@/lib/services/progress-service";
import { requireCurrentUserId } from "@/lib/supabase/server";

export default async function HomePage() {
  const userId = await requireCurrentUserId();

  const [continueItems, newReleases] = await Promise.all([
    getContinueItems(userId, 12),
    listNewReleases(4),
  ]);

  return (
    <div className="space-y-12">
      <PageHeader
        title="Continuar donde lo dejaste"
        description="Lo que tienes a medias, ordenado por lo último que abriste. Un clic te lleva al capítulo o a la página exactos."
      />

      <section>
        <SectionHeader
          title="A medias"
          action={
            <Link
              href="/cursos"
              className="inline-flex items-center gap-1 text-[13px] text-muted hover:text-foreground"
            >
              Ver catálogo <ArrowRight className="size-3.5" strokeWidth={1.75} />
            </Link>
          }
        />
        {continueItems.length > 0 ? (
          <Rail>
            {continueItems.map((item) => (
              <ContinueCard
                key={item.kind === "course" ? item.course.id : item.book.id}
                item={item}
              />
            ))}
          </Rail>
        ) : (
          <EmptyState
            title="Aún no has empezado nada"
            description="Abre cualquier curso o libro del catálogo y aparecerá aquí para retomarlo."
          />
        )}
      </section>

      <section>
        <SectionHeader
          title="Novedades"
          action={
            <Link
              href="/cursos"
              className="inline-flex items-center gap-1 text-[13px] text-muted hover:text-foreground"
            >
              Todos los cursos <ArrowRight className="size-3.5" strokeWidth={1.75} />
            </Link>
          }
        />
        {newReleases.length > 0 ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {newReleases.map((course) => (
              <CourseCard key={course.id} course={course} />
            ))}
          </div>
        ) : (
          <EmptyState
            title="El catálogo está vacío"
            description="Todavía no hay cursos publicados."
          />
        )}
      </section>
    </div>
  );
}
