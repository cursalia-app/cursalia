"use client";

import * as React from "react";
import Link from "next/link";
import { Check, ChevronDown, Play, Search } from "lucide-react";
import { cn, formatTimecode, normalizeSearch } from "@/lib/utils";
import type { CourseTree as CourseTreeType } from "@/lib/types/domain";

/**
 * A partir de este número de capítulos aparece el buscador dentro del árbol.
 * En cursos pequeños es ruido; en cursos gordos, localizar un capítulo
 * concreto sin él es una lucha.
 */
const SEARCH_THRESHOLD = 8;

/**
 * Índice del curso: Temas que agrupan Capítulos.
 * Nunca se dice "módulo" ni "lección" en pantalla.
 */
export function CourseTree({
  tree,
  activeLessonId,
  className,
}: {
  tree: CourseTreeType;
  activeLessonId?: string;
  className?: string;
}) {
  const activeModuleIndex = React.useMemo(() => {
    if (!activeLessonId) return 0;
    const index = tree.modules.findIndex((m) => m.lessons.some((l) => l.id === activeLessonId));
    return index === -1 ? 0 : index;
  }, [tree.modules, activeLessonId]);

  const [open, setOpen] = React.useState<Set<number>>(() => new Set([activeModuleIndex]));
  const [query, setQuery] = React.useState("");

  const normalized = normalizeSearch(query);
  const filtering = normalized.length > 0;
  const showSearch = tree.lessonCount >= SEARCH_THRESHOLD;

  // Los temas con al menos un capítulo que empate se conservan; el resto se
  // ocultan. Cuando hay filtro, todos los temas visibles quedan expandidos
  // para que el resultado sea inmediato, sin necesidad de otro clic.
  const visibleModules = React.useMemo(() => {
    if (!filtering) return tree.modules.map((module, index) => ({ module, index }));
    return tree.modules
      .map((module, index) => ({
        module: {
          ...module,
          lessons: module.lessons.filter((lesson) =>
            normalizeSearch(lesson.title).includes(normalized),
          ),
        },
        index,
      }))
      .filter((entry) => entry.module.lessons.length > 0);
  }, [tree.modules, filtering, normalized]);

  const matchCount = filtering
    ? visibleModules.reduce((acc, entry) => acc + entry.module.lessons.length, 0)
    : 0;

  const toggle = (index: number) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });

  return (
    <div className={cn("space-y-3", className)}>
      {showSearch ? (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="relative w-full max-w-sm">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-subtle"
              strokeWidth={2}
              aria-hidden
            />
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Buscar un capítulo"
              aria-label="Buscar un capítulo"
              className="h-9 w-full rounded-lg border border-line bg-card pl-9 pr-3 text-sm placeholder:text-subtle focus:border-line-strong focus:outline-none"
            />
          </div>
          {filtering ? (
            <span className="num text-[11px] text-subtle">
              {matchCount} {matchCount === 1 ? "capítulo" : "capítulos"}
            </span>
          ) : null}
        </div>
      ) : null}

      <div className="divide-y divide-line overflow-hidden rounded-[10px] border border-line">
        {visibleModules.length === 0 ? (
          <p className="px-4 py-8 text-center text-[13px] text-subtle">
            Sin capítulos que coincidan con &ldquo;{query.trim()}&rdquo;.
          </p>
        ) : null}

        {visibleModules.map(({ module, index }) => {
          // Cuando el usuario filtra queremos ver todo lo que encaja de golpe.
          const isOpen = filtering ? true : open.has(index);
          const done = module.lessons.filter((l) => l.progress?.completedAt).length;

        return (
          <div key={module.id}>
            <button
              type="button"
              onClick={() => (filtering ? undefined : toggle(index))}
              aria-expanded={isOpen}
              className="flex w-full items-center gap-3 bg-card px-4 py-3 text-left transition-colors hover:bg-elevated"
            >
              <span className="num text-[11px] text-subtle">
                {(index + 1).toString().padStart(2, "0")}
              </span>
              <span className="flex-1 text-sm font-medium tracking-[-0.01em]">{module.title}</span>
              <span className="num text-[11px] text-subtle">
                {done}/{module.lessons.length}
              </span>
              <ChevronDown
                className={cn("size-4 text-subtle transition-transform", isOpen && "rotate-180")}
                strokeWidth={1.75}
              />
            </button>

            {isOpen ? (
              <ul className="bg-background/40">
                {module.lessons.map((lesson) => {
                  const isActive = lesson.id === activeLessonId;
                  const completed = Boolean(lesson.progress?.completedAt);
                  return (
                    <li key={lesson.id}>
                      <Link
                        href={`/cursos/${tree.slug}/${lesson.id}`}
                        aria-current={isActive ? "page" : undefined}
                        className={cn(
                          "flex items-center gap-3 border-l-2 px-4 py-2.5 text-sm transition-colors",
                          isActive
                            ? "border-primary bg-card text-foreground"
                            : "border-transparent text-muted hover:bg-card/60 hover:text-foreground",
                        )}
                      >
                        <span
                          className={cn(
                            "flex size-4 shrink-0 items-center justify-center rounded-full border",
                            completed ? "border-success/50 bg-success/15" : "border-line-strong",
                          )}
                        >
                          {completed ? (
                            <Check className="size-2.5 text-success" strokeWidth={3} />
                          ) : isActive ? (
                            <Play className="size-2 translate-x-px fill-foreground text-foreground" />
                          ) : null}
                        </span>
                        <span className="flex-1 leading-snug">{lesson.title}</span>
                        <span className="num text-[11px] text-subtle">
                          {formatTimecode(lesson.durationSeconds)}
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            ) : null}
          </div>
        );
      })}
      </div>
    </div>
  );
}
