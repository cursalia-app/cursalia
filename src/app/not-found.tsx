import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="mx-auto flex min-h-[60vh] max-w-md flex-col items-center justify-center gap-4 px-4 text-center">
      <p className="num text-[11px] uppercase tracking-wider text-subtle">404</p>
      <h1 className="text-xl font-semibold tracking-[-0.02em]">Esta página no existe</h1>
      <p className="text-sm text-muted">
        Puede que el enlace esté roto o que el contenido ya no esté disponible.
      </p>
      <Button asChild variant="primary" size="sm" className="mt-2">
        <Link href="/">Volver al inicio</Link>
      </Button>
    </div>
  );
}
