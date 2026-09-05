import type { Metadata } from "next";
import { CoursesCatalog } from "@/components/catalog/courses-catalog";
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
    <div>
      <PageHeader
        title="Cursos"
        description={`${total} cursos publicados en ${catalog.length} categorías. Tu suscripción los abre todos.`}
      />

      <CoursesCatalog catalog={catalog} />
    </div>
  );
}
