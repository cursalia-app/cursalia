"use client";

import { useMemo, useState } from "react";
import { CourseCard } from "@/components/catalog/course-card";
import { SearchInput } from "@/components/catalog/search-input";
import { EmptyState } from "@/components/ui/primitives";
import { normalizeSearch } from "@/lib/utils";
import type { CategoryWithCourses } from "@/lib/types/domain";

/**
 * Vista completa del catálogo con filtro por texto. El filtrado ocurre en
 * memoria sobre los datos que ya trajo el server (título, descripción y
 * categoría). Una categoría cuyo filtro deja sin cursos se oculta.
 */
export function CoursesCatalog({ catalog }: { catalog: CategoryWithCourses[] }) {
  const [query, setQuery] = useState("");
  const normalized = normalizeSearch(query);

  const filtered = useMemo(() => {
    if (!normalized) return catalog;
    return catalog
      .map((category) => ({
        ...category,
        courses: category.courses.filter((course) => {
          const haystack = normalizeSearch(
            `${course.title} ${course.description} ${category.name}`,
          );
          return haystack.includes(normalized);
        }),
      }))
      .filter((category) => category.courses.length > 0);
  }, [catalog, normalized]);

  const total = filtered.reduce((acc, category) => acc + category.courses.length, 0);

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <SearchInput
          value={query}
          onChange={setQuery}
          placeholder="Busca por título, tema o categoría"
        />
        {normalized ? (
          <span className="num text-[11px] text-subtle">
            {total} {total === 1 ? "resultado" : "resultados"}
          </span>
        ) : null}
      </div>

      {total === 0 ? (
        <EmptyState
          title="Sin resultados"
          description={`No hay cursos que coincidan con "${query.trim()}".`}
        />
      ) : (
        <div className="space-y-12">
          {filtered.map((category) => (
            <section key={category.id}>
              <div className="mb-4 flex items-baseline justify-between gap-4">
                <h2 className="text-base font-medium tracking-[-0.01em]">{category.name}</h2>
                <span className="num text-[11px] text-subtle">
                  {category.courses.length} cursos
                </span>
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {category.courses.map((course) => (
                  <CourseCard key={course.id} course={course} />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
