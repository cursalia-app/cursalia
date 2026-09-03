import type { Metadata } from "next";
import { CourseCard } from "@/components/catalog/course-card";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/ui/primitives";
import { listCatalog } from "@/lib/services/catalog-service";
import { requireCurrentUserId } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Cursos" };

export default async function CoursesPage() {
  const userId = await requireCurrentUserId();
  const catalog = (await listCatalog(userId)).filter((category) => category.courses.length > 0);

  const total = catalog.reduce((acc, category) => acc + category.courses.length, 0);

  if (total === 0) {
    return (
      <div>
        <PageHeader title="Cursos" />
        <EmptyState
          title="Todavía no hay cursos publicados"
          description="En cuanto se publique el primero aparecerá aquí."
        />
      </div>
    );
  }

  return (
    <div className="space-y-12">
      <PageHeader
        title="Cursos"
        description={`${total} cursos publicados en ${catalog.length} categorías. Tu suscripción los abre todos.`}
      />

      {catalog.map((category) => (
        <section key={category.id}>
          <div className="mb-4 flex items-baseline justify-between gap-4">
            <h2 className="text-base font-medium tracking-[-0.01em]">{category.name}</h2>
            <span className="num text-[11px] text-subtle">{category.courses.length} cursos</span>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {category.courses.map((course) => (
              <CourseCard key={course.id} course={course} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
