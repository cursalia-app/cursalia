"use client";

import { useEffect } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";

/**
 * Error boundary de aplicación. Se dispara cuando un Server o Client
 * Component lanza durante el render. Muestra el mismo mensaje al usuario
 * pase lo que pase; el error concreto se envía a consola para que el equipo
 * lo vea en logs de la plataforma (Vercel u otra).
 */
export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[app:error]", error);
  }, [error]);

  return (
    <div className="mx-auto flex min-h-[60vh] max-w-md flex-col items-center justify-center gap-4 px-4 text-center">
      <p className="text-[11px] uppercase tracking-wider text-subtle">Error</p>
      <h1 className="text-xl font-semibold tracking-[-0.02em]">Algo ha ido mal</h1>
      <p className="text-sm text-muted">
        Hemos anotado el fallo. Prueba a reintentar o vuelve al inicio; si sigue pasando,
        escríbenos a <a className="underline" href="mailto:soporte@cursalia.com">soporte@cursalia.com</a>.
      </p>
      <div className="flex gap-2 pt-2">
        <Button variant="primary" size="sm" onClick={() => reset()}>
          Reintentar
        </Button>
        <Button asChild variant="ghost" size="sm">
          <Link href="/">Volver al inicio</Link>
        </Button>
      </div>
    </div>
  );
}
