import { cn } from "@/lib/utils";

/** Cifra destacada. Los números siempre en monoespaciada y tabulares. */
export function Stat({
  label,
  value,
  hint,
  className,
}: {
  label: string;
  value: string;
  hint?: string;
  className?: string;
}) {
  return (
    <div className={cn("rounded-[10px] border border-line bg-card p-5", className)}>
      <p className="text-[11px] uppercase tracking-wider text-subtle">{label}</p>
      <p className="num mt-2 text-2xl tracking-[-0.02em] text-foreground">{value}</p>
      {hint ? <p className="mt-1 text-[12px] text-muted">{hint}</p> : null}
    </div>
  );
}
