import type { Metadata } from "next";
import { PageHeader } from "@/components/layout/page-header";
import { CategoryManager } from "@/components/admin/category-manager";
import { listCategoriesForAdmin } from "@/lib/services/admin-query-service";

export const metadata: Metadata = { title: "Categorías" };

export default async function AdminCategoriesPage() {
  const categories = await listCategoriesForAdmin();

  return (
    <div>
      <PageHeader
        title="Categorías"
        description="Agrupaciones del catálogo. Arrastra para cambiar el orden en que se muestran."
      />
      <CategoryManager categories={categories} />
    </div>
  );
}
