"use client";

import { useEffect, useId, useRef } from "react";
import { useSearchParams } from "next/navigation";
import { Search, X } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Input de búsqueda del catálogo. El filtrado sucede arriba, en el componente
 * padre; aquí solo se maneja el texto y su sincronización con `?q=` en la URL.
 *
 * Se usa `history.replaceState` para que compartir un enlace conserve la
 * búsqueda sin ensuciar el historial ni disparar re-render RSC en cada tecla.
 */
export function SearchInput({
  value,
  onChange,
  placeholder,
  syncParam = "q",
  className,
}: {
  value: string;
  onChange: (next: string) => void;
  placeholder: string;
  /** Nombre del parámetro en la URL. Si es null, no se sincroniza. */
  syncParam?: string | null;
  className?: string;
}) {
  const id = useId();
  const searchParams = useSearchParams();
  const hydrated = useRef(false);

  useEffect(() => {
    if (hydrated.current || !syncParam) return;
    hydrated.current = true;
    const initial = searchParams.get(syncParam) ?? "";
    if (initial && initial !== value) onChange(initial);
    // Solo al montar; la URL alimenta el estado, no al revés en este momento.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!syncParam || typeof window === "undefined") return;
    const url = new URL(window.location.href);
    if (value) url.searchParams.set(syncParam, value);
    else url.searchParams.delete(syncParam);
    window.history.replaceState(null, "", url.toString());
  }, [value, syncParam]);

  return (
    <div className={cn("relative w-full max-w-sm", className)}>
      <label htmlFor={id} className="sr-only">
        Buscar
      </label>
      <Search
        className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-subtle"
        strokeWidth={2}
        aria-hidden
      />
      <input
        id={id}
        type="search"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        autoComplete="off"
        spellCheck={false}
        className="h-9 w-full rounded-full border border-line bg-card pl-9 pr-9 text-sm text-foreground placeholder:text-subtle focus:border-line-strong focus:outline-none"
      />
      {value ? (
        <button
          type="button"
          onClick={() => onChange("")}
          className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full p-1 text-subtle transition-colors hover:text-foreground"
          aria-label="Limpiar búsqueda"
        >
          <X className="size-3.5" strokeWidth={2.25} />
        </button>
      ) : null}
    </div>
  );
}
