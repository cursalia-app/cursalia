import Link from "next/link";
import { BookOpen, Play } from "lucide-react";
import { CoverFallback } from "@/components/catalog/cover";
import { Progress } from "@/components/ui/primitives";
import { formatPercent } from "@/lib/utils";
import type { ContinueItem } from "@/lib/types/domain";

/**
 * Tarjeta de "Continuar". Cursos y libros comparten formato para que la fila
 * mantenga el ritmo; el icono y el subtítulo dicen de qué se trata.
 * Un solo clic lleva al capítulo o a la página exactos.
 */
export function ContinueCard({ item }: { item: ContinueItem }) {
  const isCourse = item.kind === "course";
  const href = isCourse
    ? `/cursos/${item.course.slug}/${item.resumeLessonId}`
    : `/libros/${item.book.slug}?pagina=${item.resumePage}`;
  const seed = isCourse ? item.course.slug : item.book.slug;
  const title = isCourse ? item.course.title : item.book.title;
  const ratio = isCourse ? (item.course.progress?.ratio ?? 0) : (item.book.progress?.ratio ?? 0);
  const subtitle = isCourse
    ? item.resumeLessonTitle
    : `Página ${item.resumePage} de ${item.book.pageCount}`;

  return (
    <Link
      href={href}
      className="group flex w-[264px] shrink-0 snap-start flex-col overflow-hidden rounded-[10px] border border-line bg-card transition-colors hover:border-line-strong sm:w-[300px]"
    >
      <div className="relative aspect-video w-full overflow-hidden bg-background">
        <CoverFallback seed={seed} />
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="flex size-11 items-center justify-center rounded-full border border-line-strong bg-background/70 backdrop-blur transition-colors group-hover:bg-background/90">
            {isCourse ? (
              <Play className="size-4 translate-x-px fill-foreground text-foreground" />
            ) : (
              <BookOpen className="size-4 text-foreground" strokeWidth={1.75} />
            )}
          </span>
        </div>
      </div>

      <div className="flex flex-1 flex-col gap-1 p-4">
        <h3 className="truncate text-sm font-medium tracking-[-0.01em]">{title}</h3>
        <p className="truncate text-[11px] text-subtle">{subtitle}</p>
        <div className="mt-3">
          <Progress value={ratio} />
          <p className="num mt-2 text-[11px] text-subtle">{formatPercent(ratio)} completado</p>
        </div>
      </div>
    </Link>
  );
}
