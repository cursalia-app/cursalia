import type { Metadata } from "next";
import { PageHeader } from "@/components/layout/page-header";
import { BookManager } from "@/components/admin/book-manager";
import { listBooksForAdmin } from "@/lib/services/admin-query-service";

export const metadata: Metadata = { title: "Libros" };

export default async function AdminBooksPage() {
  const books = await listBooksForAdmin();

  return (
    <div>
      <PageHeader
        title="Biblioteca"
        description="Los archivos viven en Bunny Storage. Aquí solo se guarda su ruta."
      />
      <BookManager books={books} />
    </div>
  );
}
