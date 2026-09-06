"use client";

import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { BookOpen, GraduationCap, Loader2, Search, X } from "lucide-react";
import { searchCatalogAction } from "@/lib/actions/search-actions";
import type { SearchResults } from "@/lib/services/search-service";
import { cn } from "@/lib/utils";

const EMPTY: SearchResults = { courses: [], books: [] };
const DEBOUNCE_MS = 220;
const MIN_CHARS = 2;

/**
 * Hook con el estado de la búsqueda: texto, resultados del último batch, y si
 * hay una consulta en vuelo. La derivación de resultados evita setear estado
 * desde efectos, cumpliendo la nueva regla estricta de React 19.
 */
function useCatalogSearch() {
  const [query, setQuery] = useState("");
  const [lastResult, setLastResult] = useState<{ query: string; data: SearchResults }>({
    query: "",
    data: EMPTY,
  });
  const [pending, startTransition] = useTransition();

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
  const results = useMemo(
    () =>
      trimmedQuery.length >= MIN_CHARS && lastResult.query === trimmedQuery
        ? lastResult.data
        : EMPTY,
    [trimmedQuery, lastResult],
  );

  return { query, setQuery, trimmedQuery, results, pending, showResults: trimmedQuery.length >= MIN_CHARS };
}

/** Panel de resultados común a la sidebar y al modal móvil. */
function ResultsPanel({
  results,
  pending,
  trimmedQuery,
  onNavigate,
  className,
}: {
  results: SearchResults;
  pending: boolean;
  trimmedQuery: string;
  onNavigate: () => void;
  className?: string;
}) {
  const hasResults = results.courses.length > 0 || results.books.length > 0;
  const router = useRouter();

  return (
    <div role="listbox" className={cn("overflow-y-auto", className)}>
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
                onNavigate();
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
                onNavigate();
                router.push(`/libros/${book.slug}`);
              }}
            />
          ))}
        </ResultSection>
      ) : null}
    </div>
  );
}

/**
 * Búsqueda global de la barra lateral (versión desktop).
 * Con la tecla "/" enfocamos el input, siempre que el usuario no esté
 * escribiendo en otro campo — así el atajo no interfiere con formularios.
 */
export function GlobalSearch({ className }: { className?: string }) {
  const id = useId();
  const { query, setQuery, trimmedQuery, results, pending, showResults } = useCatalogSearch();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

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

  // Atajo global "/" para enfocar el input, salvo que el foco ya esté en un
  // campo de texto o en un contenteditable.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "/") return;
      const target = event.target as HTMLElement | null;
      const isTyping =
        target?.tagName === "INPUT" ||
        target?.tagName === "TEXTAREA" ||
        target?.isContentEditable;
      if (isTyping) return;
      event.preventDefault();
      inputRef.current?.focus();
      setOpen(true);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

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
        ref={inputRef}
        type="search"
        value={query}
        onChange={(event) => {
          setQuery(event.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        placeholder="Buscar (pulsa /)"
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

      {open && showResults ? (
        <ResultsPanel
          results={results}
          pending={pending}
          trimmedQuery={trimmedQuery}
          onNavigate={() => setOpen(false)}
          className="absolute left-0 right-0 top-full z-40 mt-2 max-h-[70vh] rounded-lg border border-line bg-surface shadow-xl"
        />
      ) : null}
    </div>
  );
}

/**
 * Botón + overlay a pantalla completa para móvil. Reutiliza el mismo hook y
 * panel, así que la lógica y el look empatan con la sidebar.
 */
export function GlobalSearchMobile({ className }: { className?: string }) {
  const [open, setOpen] = useState(false);
  const { query, setQuery, trimmedQuery, results, pending, showResults } = useCatalogSearch();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const id = useId();

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn(
          "inline-flex size-9 items-center justify-center rounded-full border border-line bg-card text-foreground transition-colors hover:border-line-strong",
          className,
        )}
        aria-label="Buscar en el catálogo"
      >
        <Search className="size-4" strokeWidth={2} />
      </button>

      {open ? (
        <div className="fixed inset-0 z-50 flex flex-col bg-background/95 backdrop-blur">
          <div className="flex items-center gap-2 border-b border-line px-3 py-3">
            <div className="relative flex-1">
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
                ref={inputRef}
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Buscar cursos y libros"
                autoComplete="off"
                spellCheck={false}
                className="h-10 w-full rounded-lg border border-line bg-card pl-9 pr-3 text-base text-foreground placeholder:text-subtle focus:border-line-strong focus:outline-none"
              />
              {pending ? (
                <Loader2
                  className="absolute right-2.5 top-1/2 size-3.5 -translate-y-1/2 animate-spin text-subtle"
                  aria-hidden
                />
              ) : null}
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="inline-flex size-10 items-center justify-center rounded-lg text-subtle transition-colors hover:text-foreground"
              aria-label="Cerrar búsqueda"
            >
              <X className="size-5" strokeWidth={2} />
            </button>
          </div>
          <div className="flex-1 overflow-hidden">
            {showResults ? (
              <ResultsPanel
                results={results}
                pending={pending}
                trimmedQuery={trimmedQuery}
                onNavigate={() => setOpen(false)}
                className="h-full"
              />
            ) : (
              <p className="px-6 py-8 text-center text-sm text-subtle">
                Escribe al menos dos letras para buscar.
              </p>
            )}
          </div>
        </div>
      ) : null}
    </>
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
