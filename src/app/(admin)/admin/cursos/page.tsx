import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { CourseCreateForm } from "@/components/admin/course-create-form";
import { StatusBadge } from "@/components/admin/course-editor";
import { listCategoriesForAdmin, listCoursesForAdmin } from "@/lib/services/admin-query-service";

export const metadata: Metadata = { title: "Cursos" };

export default async function AdminCoursesPage() {
  const [courses, categories] = await Promise.all([
    listCoursesForAdmin(),
    listCategoriesForAdmin(),
  ]);

  return (
    <div className="space-y-8">
      <PageHeader
        title="Cursos"
        description="Crea, edita y publica. Un curso nace en borrador y no se ve hasta que lo publicas."
      />

      <CourseCreateForm categories={categories} />

      <div className="space-y-2">
        {courses.map((course) => (
          <Link
            key={course.id}
            href={`/admin/cursos/${course.id}`}
            className="flex flex-wrap items-center gap-3 rounded-[10px] border border-line bg-card px-4 py-3 transition-colors hover:border-line-strong"
          >
            <div className="min-w-0 flex-1 basis-48">
              <p className="truncate text-sm font-medium">{course.title}</p>
              <p className="num text-[11px] text-subtle">
                {course.categoryName} · {course.moduleCount} temas · {course.lessonCount} capítulos
              </p>
            </div>
            <StatusBadge status={course.status} />
            <ChevronRight className="size-4 shrink-0 text-subtle" strokeWidth={1.75} />
          </Link>
        ))}

        {courses.length === 0 ? (
          <p className="rounded-[10px] border border-dashed border-line px-5 py-12 text-center text-sm text-muted">
            Todavía no hay cursos. Crea el primero arriba, o importa una carpeta entera desde
            Importar.
          </p>
        ) : null}
      </div>
    </div>
  );
}
