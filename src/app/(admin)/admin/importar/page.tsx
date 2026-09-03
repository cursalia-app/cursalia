import type { Metadata } from "next";
import { PageHeader } from "@/components/layout/page-header";
import { ImportForm } from "@/components/admin/import-form";
import { listCategoriesForAdmin } from "@/lib/services/admin-query-service";

export const metadata: Metadata = { title: "Importar" };

export default async function AdminImportPage() {
  const categories = await listCategoriesForAdmin();

  return (
    <div>
      <PageHeader
        title="Importar un curso"
        description="Trae una carpeta entera de golpe: temas, capítulos y vídeos ya subidos a Bunny."
      />
      <ImportForm categories={categories} />
    </div>
  );
}
