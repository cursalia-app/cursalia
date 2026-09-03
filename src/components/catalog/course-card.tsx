import Link from "next/link";
import Image from "next/image";
import { Layers, PlayCircle } from "lucide-react";
import { CoverFallback } from "@/components/catalog/cover";
import { Progress } from "@/components/ui/primitives";
import { cn, formatDuration } from "@/lib/utils";
import type { CourseWithProgress } from "@/lib/types/domain";

export function CourseCard({
  course,
  href,
  className,
}: {
  course: CourseWithProgress;
  href?: string;
  className?: string;
}) {
  const target = href ?? `/cursos/${course.slug}`;

  return (
    <Link
      href={target}
      className={cn(
        "group flex flex-col overflow-hidden rounded-[10px] border border-line bg-card transition-colors hover:border-line-strong",
        className,
      )}
    >
      <div className="relative aspect-video w-full overflow-hidden bg-background">
        {course.coverUrl ? (
          <Image
            src={course.coverUrl}
            alt=""
            fill
            sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 320px"
            className="object-cover"
          />
        ) : (
          <CoverFallback seed={course.slug} />
        )}
        <div className="absolute inset-0 bg-background/0 transition-colors group-hover:bg-background/20" />
        {course.status === "archived" ? (
          <span className="absolute left-2 top-2 rounded-full border border-line-strong bg-background/85 px-2 py-0.5 text-[10px] text-muted backdrop-blur">
            Archivado
          </span>
        ) : null}
      </div>

      <div className="flex flex-1 flex-col gap-2 p-4">
        <p className="text-[11px] uppercase tracking-wider text-subtle">{course.categoryName}</p>
        <h3 className="text-sm font-medium leading-snug tracking-[-0.01em] text-foreground">
          {course.title}
        </h3>
        <div className="mt-auto flex items-center gap-3 pt-1 text-[11px] text-subtle">
          <span className="inline-flex items-center gap-1">
            <Layers className="size-3" strokeWidth={2} />
            {course.moduleCount} temas
          </span>
          <span className="inline-flex items-center gap-1">
            <PlayCircle className="size-3" strokeWidth={2} />
            {course.lessonCount} capítulos
          </span>
          <span className="num ml-auto">{formatDuration(course.durationSeconds)}</span>
        </div>
      </div>

      {course.progress ? (
        <div className="px-4 pb-4">
          <Progress value={course.progress.ratio} />
          <p className="num mt-2 text-[11px] text-subtle">
            {course.progress.completedLessons} de {course.progress.totalLessons} capítulos
          </p>
        </div>
      ) : null}
    </Link>
  );
}
