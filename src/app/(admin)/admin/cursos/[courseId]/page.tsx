import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft, ExternalLink } from "lucide-react";
import { CourseEditor } from "@/components/admin/course-editor";
import { PageHeader } from "@/components/layout/page-header";
import { getCourseForAdmin, listCategoriesForAdmin } from "@/lib/services/admin-query-service";

interface Params {
  params: Promise<{ courseId: string }>;
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { courseId } = await params;
  const course = await getCourseForAdmin(courseId);
  return { title: course?.title ?? "Curso" };
}

export default async function AdminCoursePage({ params }: Params) {
  const { courseId } = await params;
  const [course, categories] = await Promise.all([
    getCourseForAdmin(courseId),
    listCategoriesForAdmin(),
  ]);

  if (!course) notFound();

  return (
    <div className="space-y-6">
      <Link
        href="/admin/cursos"
        className="inline-flex items-center gap-1.5 text-[13px] text-muted hover:text-foreground"
      >
        <ChevronLeft className="size-4" strokeWidth={1.75} />
        Cursos
      </Link>

      <PageHeader
        title={course.title}
        description={`${course.moduleCount} temas · ${course.lessonCount} capítulos`}
        action={
          course.status === "published" ? (
            <Link
              href={`/cursos/${course.slug}`}
              className="inline-flex items-center gap-1.5 text-[13px] text-muted hover:text-foreground"
            >
              Ver en la plataforma
              <ExternalLink className="size-3.5" strokeWidth={1.75} />
            </Link>
          ) : null
        }
      />

      <CourseEditor course={course} categories={categories} />
    </div>
  );
}
