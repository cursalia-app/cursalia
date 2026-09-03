import { redirect } from "next/navigation";
import { MobileTabBar, MobileTopBar, Sidebar } from "@/components/layout/sidebar";
import { DeviceRegistrar } from "@/components/account/device-registrar";
import { getAccessState } from "@/lib/services/access-service";
import { getCurrentProfile } from "@/lib/supabase/server";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/entrar");

  const access = await getAccessState(profile.id);

  return (
    <div className="min-h-dvh">
      <Sidebar profile={profile} access={access} />
      <MobileTopBar access={access} />
      <main className="px-4 pb-24 pt-6 lg:ml-60 lg:px-10 lg:pb-16 lg:pt-10">
        <div className="mx-auto w-full max-w-[1280px]">{children}</div>
      </main>
      <MobileTabBar />
      {/* Registra este aparato en cuanto se abre la aplicación (RN-08). */}
      <DeviceRegistrar />
    </div>
  );
}
