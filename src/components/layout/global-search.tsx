"use client";

import { useCallback, useEffect, useId, useRef, useState, useTransition } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { BookOpen, GraduationCap, Loader2, Search } from "lucide-react";
import { searchCatalogAction } from "@/lib/actions/search-actions";
import type { SearchResults } from "@/lib/services/search-service";
import { cn } from "@/lib/utils";

const EMPTY: SearchResults = { courses: [], books: [] };
const DEBOUNCE_MS = 220;
const MIN_CHARS = 2;

/**
 * Búsqueda global de la barra lateral. Al escribir se dispara con debounce
 * corto la server action, que respeta RLS y aplica rate limit por usuario.
 * Los resultados aparecen en un dropdown flotante bajo el input. La navegación
 * (Link) cierra el panel al cambiar de ruta.
 */
export function GlobalSearch({ className }: { className?: string }) {
  const id = useId();
  const router = useRouter();
  const [query, setQuery] = useState("");
  // Guardamos el query bajo el que llegaron los últimos resultados: así, cuando
  // el usuario borra hasta bajar del mínimo, no hace falta setear estado desde
  // el effect (React 19 lo prohíbe): derivamos EMPTY comparando ambos valores.
  const [lastResult, setLastResult] = useState<{ query: string; data: SearchResults }>({
    query: "",
    data: EMPTY,
  });
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const containerRef = useRef<HTMLDivElement | null>(null);

  const runSearch = useCallback((value: string) => {
    startTransition(async () => {
      const data = await searchCatalogAction(value);
      setLastResult({ query: value, data });
    });
  }, []);

  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length < MIN_CHARS) return;
    const timer = setTimeout(() => runSearch(trimmed), DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [query, runSearch]);

  const trimmedQuery = query.trim();
  const results =
    trimmedQuery.length >= MIN_CHARS && lastResult.query === trimmedQuery
      ? lastResult.data
      : EMPTY;

  // Cierre al hacer clic fuera o pulsar ESC.
  useEffect(() => {
    if (!open) return;
    const onDown = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const showPanel = open && trimmedQuery.length >= MIN_CHARS;
  const hasResults = results.courses.length > 0 || results.books.length > 0;

  return (
    <div ref={containerRef} className={cn("relative", className)}>
      <label htmlFor={id} className="sr-only">
        Buscar en el catálogo
      </label>
      <Search
        className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-subtle"
        strokeWidth={2}
        aria-hidden
      />
      <input
        id={id}
        type="search"
        value={query}
        onChange={(event) => {
          setQuery(event.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        placeholder="Buscar cursos y libros"
        autoComplete="off"
        spellCheck={false}
        className="h-9 w-full rounded-lg border border-line bg-card pl-9 pr-8 text-sm text-foreground placeholder:text-subtle focus:border-line-strong focus:outline-none"
      />
      {pending ? (
        <Loader2
          className="absolute right-2.5 top-1/2 size-3.5 -translate-y-1/2 animate-spin text-subtle"
          aria-hidden
        />
      ) : null}

      {showPanel ? (
        <div
          role="listbox"
          className="absolute left-0 right-0 top-full z-40 mt-2 max-h-[70vh] overflow-y-auto rounded-lg border border-line bg-surface shadow-xl"
        >
          {!hasResults && !pending ? (
            <p className="px-4 py-6 text-center text-[13px] text-subtle">
              Sin coincidencias para &ldquo;{trimmedQuery}&rdquo;
            </p>
          ) : null}

          {results.courses.length > 0 ? (
            <ResultSection title="Cursos">
              {results.courses.map((course) => (
                <ResultRow
                  key={course.id}
                  href={`/cursos/${course.slug}`}
                  cover={course.cover_url}
                  seed={course.slug}
                  title={course.title}
                  subtitle={course.category_name}
                  icon={<GraduationCap className="size-3.5" strokeWidth={1.75} />}
                  onNavigate={() => {
                    setOpen(false);
                    router.push(`/cursos/${course.slug}`);
                  }}
                />
              ))}
            </ResultSection>
          ) : null}

          {results.books.length > 0 ? (
            <ResultSection title="Libros">
              {results.books.map((book) => (
                <ResultRow
                  key={book.id}
                  href={`/libros/${book.slug}`}
                  cover={book.cover_url}
                  seed={book.slug}
                  title={book.title}
                  subtitle={book.author ?? "Autor desconocido"}
                  icon={<BookOpen className="size-3.5" strokeWidth={1.75} />}
                  onNavigate={() => {
                    setOpen(false);
                    router.push(`/libros/${book.slug}`);
                  }}
                />
              ))}
            </ResultSection>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function ResultSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="py-1.5">
      <p className="px-4 pb-1 pt-1.5 text-[10px] font-medium uppercase tracking-wider text-subtle">
        {title}
      </p>
      {children}
    </div>
  );
}

function ResultRow({
  href,
  cover,
  seed,
  title,
  subtitle,
  icon,
  onNavigate,
}: {
  href: string;
  cover: string | null;
  seed: string;
  title: string;
  subtitle: string;
  icon: React.ReactNode;
  onNavigate: () => void;
}) {
  return (
    <Link
      href={href}
      onClick={onNavigate}
      className="flex items-center gap-3 px-4 py-2 transition-colors hover:bg-card"
    >
      <div className="relative size-9 shrink-0 overflow-hidden rounded-md border border-line bg-card">
        {cover ? (
          <Image src={cover} alt="" fill sizes="36px" className="object-cover" />
        ) : (
          <div
            className="size-full"
            style={{
              background: `linear-gradient(135deg, hsl(${(seed.charCodeAt(0) * 137) % 360} 30% 20%), hsl(${(seed.charCodeAt(seed.length - 1) * 71) % 360} 30% 30%))`,
            }}
          />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm text-foreground">{title}</p>
        <p className="flex items-center gap-1 truncate text-[11px] text-subtle">
          <span aria-hidden>{icon}</span>
          {subtitle}
        </p>
      </div>
    </Link>
  );
}
