"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BookOpen,
  FolderTree,
  GraduationCap,
  LayoutDashboard,
  Receipt,
  Settings,
  Upload,
  Users,
} from "lucide-react";
import { Logo } from "@/components/brand/logo";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/admin", label: "Resumen", icon: LayoutDashboard, exact: true },
  { href: "/admin/cursos", label: "Cursos", icon: GraduationCap, exact: false },
  { href: "/admin/categorias", label: "Categorías", icon: FolderTree, exact: false },
  { href: "/admin/libros", label: "Libros", icon: BookOpen, exact: false },
  { href: "/admin/importar", label: "Importar", icon: Upload, exact: false },
  { href: "/admin/usuarios", label: "Usuarios", icon: Users, exact: false },
  { href: "/admin/comisiones", label: "Comisiones", icon: Receipt, exact: false },
  { href: "/admin/ajustes", label: "Ajustes", icon: Settings, exact: false },
] as const;

export function AdminNav() {
  const pathname = usePathname();

  return (
    <aside className="fixed inset-y-0 left-0 z-30 hidden w-56 flex-col border-r border-line bg-surface lg:flex">
      <div className="flex h-16 items-center gap-2 px-5">
        <Link href="/admin" aria-label="Panel de Cursalia">
          <Logo />
        </Link>
        <span className="rounded-full border border-line px-2 py-0.5 text-[10px] uppercase tracking-wider text-subtle">
          Panel
        </span>
      </div>

      <nav className="flex-1 space-y-0.5 px-3 py-2">
        {NAV.map(({ href, label, icon: Icon, exact }) => {
          const active = exact ? pathname === href : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors",
                active ? "bg-card text-foreground" : "text-muted hover:bg-card/60 hover:text-foreground",
              )}
            >
              <Icon className="size-4 shrink-0" strokeWidth={1.75} />
              {label}
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-line px-5 py-3.5">
        <Link href="/" className="text-[12px] text-subtle underline underline-offset-4 hover:text-foreground">
          Volver a la plataforma
        </Link>
      </div>
    </aside>
  );
}

/** En móvil el panel se navega con una tira horizontal: no cabe una barra lateral. */
export function AdminTabs() {
  const pathname = usePathname();

  return (
    <div className="scrollbar-none sticky top-0 z-20 flex gap-1 overflow-x-auto border-b border-line bg-background/95 px-4 py-2 backdrop-blur lg:hidden">
      {NAV.map(({ href, label, exact }) => {
        const active = exact ? pathname === href : pathname.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            className={cn(
              "whitespace-nowrap rounded-lg px-3 py-1.5 text-[13px] transition-colors",
              active ? "bg-card text-foreground" : "text-subtle hover:text-foreground",
            )}
          >
            {label}
          </Link>
        );
      })}
    </div>
  );
}
