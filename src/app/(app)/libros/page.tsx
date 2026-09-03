import type { Metadata } from "next";
import { BookCard } from "@/components/catalog/book-card";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/ui/primitives";
import { listBooks } from "@/lib/services/book-service";

export const metadata: Metadata = { title: "Libros" };

export default async function BooksPage() {
  const books = await listBooks();

  return (
    <div>
      <PageHeader
        title="Biblioteca"
        description="Lectura online dentro de la plataforma. Se guarda la última página por la que ibas."
      />

      {books.length === 0 ? (
        <EmptyState
          title="La biblioteca está vacía"
          description="Todavía no hay libros publicados."
        />
      ) : (
        <div className="grid grid-cols-2 gap-5 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-6">
          {books.map((book) => (
            <BookCard key={book.id} book={book} />
          ))}
        </div>
      )}
    </div>
  );
}
