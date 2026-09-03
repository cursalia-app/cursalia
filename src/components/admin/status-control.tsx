"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { changeStatusAction } from "@/lib/actions/admin-actions";
import { useServerState } from "@/lib/hooks/use-server-state";
import type { ContentStatus } from "@/lib/types/domain";

const OPTIONS: { value: ContentStatus; label: string }[] = [
  { value: "draft", label: "Borrador" },
  { value: "published", label: "Publicado" },
  { value: "archived", label: "Archivado" },
];

/**
 * Cambio de estado de una categoría, un curso o un libro.
 * `published_at` lo graba la base de datos en la primera publicación, no aquí.
 */
export function StatusControl({
  entity,
  id,
  status,
}: {
  entity: "category" | "course" | "book";
  id: string;
  status: ContentStatus;
}) {
  const router = useRouter();
  const [current, setCurrent] = useServerState<ContentStatus>(status);
  const [pending, startTransition] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);


  const change = (next: ContentStatus) => {
    const previous = current;
    setCurrent(next);
    setError(null);

    startTransition(async () => {
      const result = await changeStatusAction({ entity, id, status: next });
      if (!result.ok) {
        setCurrent(previous);
        setError(result.message ?? "No se ha podido cambiar el estado");
        return;
      }
      router.refresh();
    });
  };

  return (
    <div className="flex items-center gap-2">
      <div className="flex rounded-[10px] border border-line bg-background p-0.5">
        {OPTIONS.map((option) => {
          const active = current === option.value;
          return (
            <button
              key={option.value}
              type="button"
              disabled={pending}
              onClick={() => change(option.value)}
              aria-pressed={active}
              className={`rounded-lg px-2.5 py-1 text-[12px] transition-colors ${
                active ? "bg-card text-foreground" : "text-subtle hover:text-foreground"
              }`}
            >
              {option.label}
            </button>
          );
        })}
      </div>
      {error ? <span className="text-[11px] text-danger">{error}</span> : null}
    </div>
  );
}
