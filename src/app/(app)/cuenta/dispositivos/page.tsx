import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { DeviceList } from "@/components/account/device-list";
import { listDevices } from "@/lib/services/device-service";
import { getSetting } from "@/lib/services/settings-service";
import { requireCurrentUserId } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Dispositivos" };

export default async function DevicesPage() {
  const userId = await requireCurrentUserId();

  const [devices, maxDevices, cooldownDays] = await Promise.all([
    listDevices(userId),
    getSetting("max_devices"),
    getSetting("device_release_cooldown_days"),
  ]);

  return (
    <div className="max-w-2xl space-y-6">
      <Link
        href="/cuenta"
        className="inline-flex items-center gap-1.5 text-[13px] text-muted hover:text-foreground"
      >
        <ChevronLeft className="size-4" strokeWidth={1.75} />
        Cuenta
      </Link>

      <PageHeader
        title="Dispositivos"
        description={`Puedes tener hasta ${maxDevices} dispositivos registrados. Puedes liberar uno cada ${cooldownDays} días.`}
      />

      <DeviceList devices={devices} maxDevices={maxDevices} />

      <p className="text-[12px] leading-relaxed text-subtle">
        Si has llegado al límite y no reconoces alguno de estos dispositivos, libéralo y cambia tu
        contraseña.
      </p>
    </div>
  );
}
