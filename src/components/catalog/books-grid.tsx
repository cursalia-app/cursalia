"use client";

import { useMemo, useState } from "react";
import { BookCard } from "@/components/catalog/book-card";
import { SearchInput } from "@/components/catalog/search-input";
import { EmptyState } from "@/components/ui/primitives";
import { normalizeSearch } from "@/lib/utils";
import type { BookWithProgress } from "@/lib/types/domain";

/**
 * Rejilla de libros con filtro por texto. El filtrado ocurre en memoria sobre
 * los datos que ya trajo el server (título, autor y descripción).
 */
export function BooksGrid({ books }: { books: BookWithProgress[] }) {
  const [query, setQuery] = useState("");
  const normalized = normalizeSearch(query);

  const filtered = useMemo(() => {
    if (!normalized) return books;
    return books.filter((book) => {
      const haystack = normalizeSearch(`${book.title} ${book.author ?? ""} ${book.description}`);
      return haystack.includes(normalized);
    });
  }, [books, normalized]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <SearchInput
          value={query}
          onChange={setQuery}
          placeholder="Busca por título o autor"
        />
        {normalized ? (
          <span className="num text-[11px] text-subtle">
            {filtered.length} {filtered.length === 1 ? "resultado" : "resultados"}
          </span>
        ) : null}
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          title="Sin resultados"
          description={`No hay libros que coincidan con "${query.trim()}".`}
        />
      ) : (
        <div className="grid grid-cols-2 gap-5 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-6">
          {filtered.map((book) => (
            <BookCard key={book.id} book={book} />
          ))}
        </div>
      )}
    </div>
  );
}
