import type { Metadata } from "next";
import { PageHeader } from "@/components/layout/page-header";
import { SettingsForm } from "@/components/admin/settings-form";
import { listSettings } from "@/lib/services/admin-query-service";

export const metadata: Metadata = { title: "Ajustes" };

export default async function AdminSettingsPage() {
  const settings = await listSettings();

  return (
    <div>
      <PageHeader
        title="Ajustes"
        description="Cambios en caliente, sin desplegar código. Tienen efecto inmediato."
      />
      <SettingsForm settings={settings} />
    </div>
  );
}
