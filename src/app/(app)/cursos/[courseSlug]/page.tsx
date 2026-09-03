import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Layers, PlayCircle, Timer } from "lucide-react";
import { CoverFallback } from "@/components/catalog/cover";
import { CourseTree } from "@/components/catalog/course-tree";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Badge, Progress } from "@/components/ui/primitives";
import { getCourseTree } from "@/lib/services/catalog-service";
import { getCourseProgress } from "@/lib/services/progress-service";
import { requireCurrentUserId } from "@/lib/supabase/server";
import { formatDuration, formatPercent } from "@/lib/utils";

interface Params {
  params: Promise<{ courseSlug: string }>;
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { courseSlug } = await params;
  const tree = await getCourseTree(courseSlug);
  return { title: tree?.title ?? "Curso" };
}

export default async function CoursePage({ params }: Params) {
  const { courseSlug } = await params;
  const userId = await requireCurrentUserId();

  // Si RLS no deja ver el curso (borrador, o archivado sin progreso), no existe.
  const tree = await getCourseTree(courseSlug);
  if (!tree) notFound();

  const progress = await getCourseProgress(userId, tree.id);
  const firstLessonId = tree.modules[0]?.lessons[0]?.id;
  const resumeId = progress.resumeLessonId ?? firstLessonId;
  const started = progress.completedLessons > 0;

  return (
    <div className="space-y-10">
      <div className="grid gap-6 lg:grid-cols-[minmax(0,420px)_minmax(0,1fr)] lg:items-start">
        <div className="relative aspect-video w-full overflow-hidden rounded-[10px] border border-line">
          <CoverFallback seed={tree.slug} />
        </div>

        <div className="space-y-5">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone="outline">{tree.categoryName}</Badge>
            {tree.status === "archived" ? <Badge>Archivado</Badge> : null}
          </div>

          <PageHeader title={tree.title} description={tree.description} className="pb-0" />

          <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-[12px] text-subtle">
            <span className="inline-flex items-center gap-1.5">
              <Layers className="size-3.5" strokeWidth={1.75} />
              {tree.moduleCount} temas
            </span>
            <span className="inline-flex items-center gap-1.5">
              <PlayCircle className="size-3.5" strokeWidth={1.75} />
              {tree.lessonCount} capítulos
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Timer className="size-3.5" strokeWidth={1.75} />
              <span className="num">{formatDuration(tree.durationSeconds)}</span>
            </span>
          </div>

          {started ? (
            <div className="max-w-md space-y-2">
              <Progress value={progress.ratio} />
              <p className="num text-[11px] text-subtle">
                {progress.completedLessons} de {progress.totalLessons} capítulos ·{" "}
                {formatPercent(progress.ratio)}
              </p>
            </div>
          ) : null}

          {resumeId ? (
            <Button asChild variant="primary" size="lg">
              <Link href={`/cursos/${tree.slug}/${resumeId}`}>
                {started ? "Continuar curso" : "Empezar curso"}
              </Link>
            </Button>
          ) : (
            <p className="text-[13px] text-muted">
              Este curso todavía no tiene capítulos publicados.
            </p>
          )}
        </div>
      </div>

      <section className="max-w-4xl">
        <h2 className="mb-4 text-[13px] font-medium uppercase tracking-wider text-subtle">
          Contenido del curso
        </h2>
        <CourseTree tree={tree} />
      </section>
    </div>
  );
}
