"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BookOpen, GraduationCap, Home, Share2, UserRound } from "lucide-react";
import { Logo } from "@/components/brand/logo";
import { TrialCountdown, AccessChip } from "@/components/access/trial-countdown";
import { cn } from "@/lib/utils";
import type { AccessState, Profile } from "@/lib/types/domain";

const NAV = [
  { href: "/", label: "Inicio", icon: Home, exact: true },
  { href: "/cursos", label: "Cursos", icon: GraduationCap, exact: false },
  { href: "/libros", label: "Libros", icon: BookOpen, exact: false },
  { href: "/afiliados", label: "Afiliados", icon: Share2, exact: false },
  { href: "/cuenta", label: "Cuenta", icon: UserRound, exact: false },
] as const;

function isActive(pathname: string, href: string, exact: boolean): boolean {
  return exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
}

export function Sidebar({ profile, access }: { profile: Profile; access: AccessState }) {
  const pathname = usePathname();

  return (
    <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 flex-col border-r border-line bg-surface lg:flex">
      <div className="flex h-16 items-center px-5">
        <Link href="/" aria-label="Cursalia, ir al inicio">
          <Logo />
        </Link>
      </div>

      <nav className="flex-1 space-y-0.5 px-3 py-2">
        {NAV.map(({ href, label, icon: Icon, exact }) => {
          const active = isActive(pathname, href, exact);
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors",
                active
                  ? "bg-card text-foreground"
                  : "text-muted hover:bg-card/60 hover:text-foreground",
              )}
            >
              <Icon className="size-4 shrink-0" strokeWidth={1.75} />
              {label}
            </Link>
          );
        })}
      </nav>

      <div className="px-3 pb-3">
        {access.kind === "trial" ? <TrialCountdown endsAt={access.trialEndsAt} /> : null}
      </div>

      <div className="border-t border-line px-5 py-3.5">
        <p className="truncate text-[13px] text-foreground">{profile.email}</p>
        <div className="mt-0.5">
          <AccessChip access={access} />
        </div>
      </div>
    </aside>
  );
}

/** Barra inferior de navegación en móvil. La app se usa mucho desde el teléfono. */
export function MobileTabBar() {
  const pathname = usePathname();

  return (
    <nav className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t border-line bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden">
      {NAV.map(({ href, label, icon: Icon, exact }) => {
        const active = isActive(pathname, href, exact);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex flex-col items-center gap-1 py-2.5 text-[10px] transition-colors",
              active ? "text-foreground" : "text-subtle",
            )}
          >
            <Icon className="size-5" strokeWidth={1.75} />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}

export function MobileTopBar({ access }: { access: AccessState }) {
  return (
    <header className="sticky top-0 z-20 flex h-14 items-center justify-between border-b border-line bg-background/90 px-4 backdrop-blur lg:hidden">
      <Link href="/" aria-label="Cursalia, ir al inicio">
        <Logo />
      </Link>
      <AccessChip access={access} />
    </header>
  );
}
