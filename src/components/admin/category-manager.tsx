"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2 } from "lucide-react";
import { SortableList, SortableRow } from "@/components/admin/sortable";
import { StatusControl } from "@/components/admin/status-control";
import { Button } from "@/components/ui/button";
import { deleteContentAction, reorderAction, saveCategoryAction } from "@/lib/actions/admin-actions";
import { useServerState } from "@/lib/hooks/use-server-state";
import type { AdminCategory } from "@/lib/services/admin-query-service";

/**
 * Categorías del catálogo. Se crean, se renombran, se reordenan arrastrando y se
 * publican desde aquí. Una categoría con cursos dentro no se borra: se archiva.
 */
export function CategoryManager({ categories }: { categories: AdminCategory[] }) {
  const router = useRouter();
  const [items, setItems] = useServerState(categories);
  const [newName, setNewName] = React.useState("");
  const [message, setMessage] = React.useState<string | null>(null);
  const [pending, startTransition] = React.useTransition();


  const notify = (result: { ok: boolean; message?: string }) => {
    setMessage(result.ok ? null : (result.message ?? "No se ha podido guardar."));
    if (result.ok) router.refresh();
  };

  const create = () => {
    if (!newName.trim()) return;
    startTransition(async () => {
      notify(await saveCategoryAction({ name: newName.trim(), position: items.length }));
      setNewName("");
    });
  };

  const rename = (id: string, name: string) =>
    startTransition(async () => {
      notify(await saveCategoryAction({ id, name }));
    });

  const remove = (category: AdminCategory) => {
    if (category.courseCount > 0) {
      setMessage("Esta categoría tiene cursos dentro. Archívala en vez de borrarla.");
      return;
    }
    startTransition(async () => {
      notify(await deleteContentAction({ entity: "category", id: category.id }));
    });
  };

  const reorder = (orderedIds: string[]) => {
    setItems((current) => orderedIds.map((id) => current.find((c) => c.id === id)!).filter(Boolean));
    startTransition(async () => {
      notify(await reorderAction({ entity: "category", orderedIds }));
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-2">
        <input
          value={newName}
          onChange={(event) => setNewName(event.target.value)}
          onKeyDown={(event) => event.key === "Enter" && create()}
          placeholder="Nombre de la nueva categoría"
          aria-label="Nombre de la nueva categoría"
          className="min-w-0 flex-1 rounded-[10px] border border-line bg-card px-3 py-2.5 text-sm outline-none placeholder:text-subtle focus:border-line-strong"
        />
        <Button variant="primary" size="md" onClick={create} disabled={pending || !newName.trim()}>
          <Plus className="size-3.5" strokeWidth={2} />
          Crear
        </Button>
      </div>

      {message ? <p className="text-[12px] text-danger">{message}</p> : null}

      <SortableList items={items} onReorder={reorder}>
        {(category) => (
          <SortableRow id={category.id}>
            <CategoryRow category={category} onRename={rename} onRemove={remove} />
          </SortableRow>
        )}
      </SortableList>
    </div>
  );
}

function CategoryRow({
  category,
  onRename,
  onRemove,
}: {
  category: AdminCategory;
  onRename: (id: string, name: string) => void;
  onRemove: (category: AdminCategory) => void;
}) {
  const [name, setName] = React.useState(category.name);

  return (
    <div className="flex flex-1 flex-wrap items-center gap-3 py-2 pr-3">
      <input
        value={name}
        onChange={(event) => setName(event.target.value)}
        onBlur={() => name !== category.name && onRename(category.id, name)}
        aria-label="Nombre de la categoría"
        className="min-w-0 flex-1 basis-40 rounded-lg border border-transparent bg-transparent px-2 py-1 text-sm outline-none transition-colors hover:border-line focus:border-line-strong focus:bg-background"
      />
      <span className="num text-[11px] text-subtle">{category.courseCount} cursos</span>
      <StatusControl entity="category" id={category.id} status={category.status} />
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label="Eliminar categoría"
        onClick={() => onRemove(category)}
      >
        <Trash2 className="size-3.5" strokeWidth={1.75} />
      </Button>
    </div>
  );
}
