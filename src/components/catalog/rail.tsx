import { cn } from "@/lib/utils";

/**
 * Carrusel horizontal con anclaje. En móvil se desliza con el dedo; en escritorio
 * se desborda con la rueda. Sin flechas: añaden ruido y no funcionan en táctil.
 */
export function Rail({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        "scrollbar-none -mx-4 flex snap-x snap-mandatory gap-4 overflow-x-auto px-4 pb-1 lg:mx-0 lg:px-0",
        className,
      )}
    >
      {children}
    </div>
  );
}
