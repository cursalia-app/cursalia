import Link from "next/link";
import { Logo } from "@/components/brand/logo";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center px-4 py-12">
      <Link href="/" aria-label="Cursalia" className="mb-8">
        <Logo />
      </Link>
      <main className="w-full max-w-sm">{children}</main>
      <p className="mt-10 text-center text-[11px] text-subtle">Una suscripción. Todo el catálogo.</p>
    </div>
  );
}
