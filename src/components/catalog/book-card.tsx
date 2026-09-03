import Link from "next/link";
import Image from "next/image";
import { CoverFallback } from "@/components/catalog/cover";
import { Progress } from "@/components/ui/primitives";
import { cn, formatPercent } from "@/lib/utils";
import type { BookWithProgress } from "@/lib/types/domain";

/**
 * La portada va en 2:3 vertical. La proporción distinta de la del curso hace
 * innecesaria cualquier etiqueta de "libro": se reconoce de un vistazo.
 */
export function BookCard({ book, className }: { book: BookWithProgress; className?: string }) {
  return (
    <Link
      href={`/libros/${book.slug}`}
      className={cn("group flex flex-col gap-3", className)}
    >
      <div className="relative aspect-[2/3] w-full overflow-hidden rounded-[10px] border border-line bg-card transition-colors group-hover:border-line-strong">
        {book.coverUrl ? (
          <Image
            src={book.coverUrl}
            alt=""
            fill
            sizes="(max-width: 640px) 45vw, 200px"
            className="object-cover"
          />
        ) : (
          <>
            <CoverFallback seed={book.slug} />
            <div className="absolute inset-0 flex items-end p-4">
              <span className="text-[13px] font-medium leading-tight text-foreground/70">
                {book.title}
              </span>
            </div>
          </>
        )}
      </div>

      <div className="space-y-1">
        <h3 className="text-sm font-medium leading-snug tracking-[-0.01em]">{book.title}</h3>
        <p className="text-[11px] text-subtle">{book.author ?? "Autor desconocido"}</p>
        {book.progress ? (
          <div className="pt-1.5">
            <Progress value={book.progress.ratio} />
            <p className="num mt-1.5 text-[11px] text-subtle">
              Página {book.progress.lastPage} · {formatPercent(book.progress.ratio)}
            </p>
          </div>
        ) : (
          <p className="num text-[11px] text-subtle">{book.pageCount} páginas</p>
        )}
      </div>
    </Link>
  );
}
