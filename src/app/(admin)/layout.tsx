import { AdminNav, AdminTabs } from "@/components/admin/admin-nav";

/**
 * El panel nunca se genera de antemano ni se cachea: siempre refleja el estado
 * real del catálogo en el momento en que se abre.
 */
export const dynamic = "force-dynamic";

/**
 * El acceso al panel lo cierra el middleware comprobando `is_admin` contra la
 * base de datos, y por debajo las policies RLS. Este layout solo dibuja.
 */
export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh">
      <AdminNav />
      <AdminTabs />
      <main className="px-4 py-6 lg:ml-56 lg:px-8 lg:py-10">
        <div className="mx-auto w-full max-w-[1200px]">{children}</div>
      </main>
    </div>
  );
}
