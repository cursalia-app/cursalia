"use client";

import * as React from "react";
import { Check, Copy } from "lucide-react";
import { cn } from "@/lib/utils";

function useCopy(): [boolean, (value: string) => void] {
  const [copied, setCopied] = React.useState(false);

  const copy = React.useCallback((value: string) => {
    void navigator.clipboard.writeText(value).then(() => {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    });
  }, []);

  return [copied, copy];
}

/** Campo de solo lectura con botón de copiar. Enlace de afiliado, código, etc. */
export function CopyField({ value, label, className }: { value: string; label?: string; className?: string }) {
  const [copied, copy] = useCopy();

  return (
    <div className={cn("space-y-1.5", className)}>
      {label ? <span className="text-[11px] uppercase tracking-wider text-subtle">{label}</span> : null}
      <div className="flex items-stretch overflow-hidden rounded-[10px] border border-line bg-background">
        <input
          readOnly
          value={value}
          onFocus={(e) => e.currentTarget.select()}
          aria-label={label ?? "Valor para copiar"}
          className="num min-w-0 flex-1 bg-transparent px-3 py-2.5 text-[13px] text-foreground outline-none"
        />
        <button
          type="button"
          onClick={() => copy(value)}
          aria-label="Copiar"
          className="flex items-center gap-1.5 border-l border-line px-3 text-[12px] text-muted transition-colors hover:bg-card hover:text-foreground"
        >
          {copied ? (
            <>
              <Check className="size-3.5 text-success" strokeWidth={2.5} /> Copiado
            </>
          ) : (
            <>
              <Copy className="size-3.5" strokeWidth={1.75} /> Copiar
            </>
          )}
        </button>
      </div>
    </div>
  );
}
