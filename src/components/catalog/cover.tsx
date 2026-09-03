import { cn } from "@/lib/utils";

/** Hash estable para que una misma portada se vea siempre igual. */
function hash(seed: string): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

/**
 * Portada de reserva. Con ~60 cursos siempre faltará alguna imagen y el catálogo
 * no puede verse roto: se dibuja un patrón geométrico monocromo derivado del slug,
 * determinista y sin peticiones de red.
 */
export function CoverFallback({ seed, className }: { seed: string; className?: string }) {
  const h = hash(seed);
  const corner = h % 4;
  const rings = 4 + (h % 5);
  const offset = 8 + (h % 14);

  const cx = corner === 0 || corner === 3 ? 0 : 100;
  const cy = corner < 2 ? 0 : 100;

  return (
    <div className={cn("relative size-full overflow-hidden bg-[#101010]", className)}>
      <svg
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        className="absolute inset-0 size-full"
        aria-hidden="true"
      >
        {Array.from({ length: rings }, (_, i) => (
          <circle
            key={i}
            cx={cx}
            cy={cy}
            r={offset * (i + 1)}
            fill="none"
            stroke="#2a2a2a"
            strokeWidth="0.6"
            vectorEffect="non-scaling-stroke"
          />
        ))}
      </svg>
      <div className="absolute inset-0 bg-gradient-to-br from-white/[0.04] to-transparent" />
    </div>
  );
}
