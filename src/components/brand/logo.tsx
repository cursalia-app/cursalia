import { cn } from "@/lib/utils";

/**
 * Boceto de marca de Cursalia.
 * Dos arcos concéntricos abiertos a la derecha: se lee como una "C" y a la vez
 * como un anillo de progreso — que es de lo que va el producto.
 * Pensado para sustituirse por el logo definitivo sin tocar los consumidores.
 */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 32 32"
      fill="none"
      aria-hidden="true"
      className={cn("size-6", className)}
    >
      <path
        d="M24.49 24.49 A12 12 0 1 0 24.49 7.51"
        stroke="currentColor"
        strokeWidth="2.6"
        strokeLinecap="round"
      />
      <path
        d="M19.89 19.89 A5.5 5.5 0 1 0 19.89 12.11"
        stroke="currentColor"
        strokeWidth="2.6"
        strokeLinecap="round"
        opacity="0.45"
      />
    </svg>
  );
}

export function Logo({ className, compact = false }: { className?: string; compact?: boolean }) {
  return (
    <span className={cn("inline-flex items-center gap-2.5 text-foreground", className)}>
      <LogoMark className="size-6" />
      {compact ? null : (
        <span className="text-[15px] font-semibold tracking-[-0.02em]">Cursalia</span>
      )}
    </span>
  );
}
