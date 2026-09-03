"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { saveCourseAction } from "@/lib/actions/admin-actions";
import type { AdminCategory } from "@/lib/services/admin-query-service";

/** Alta rápida de un curso. Nace en borrador y se completa en su editor. */
export function CourseCreateForm({ categories }: { categories: AdminCategory[] }) {
  const router = useRouter();
  const [title, setTitle] = React.useState("");
  const [categoryId, setCategoryId] = React.useState(categories[0]?.id ?? "");
  const [error, setError] = React.useState<string | null>(null);
  const [pending, startTransition] = React.useTransition();

  const create = () =>
    startTransition(async () => {
      const result = await saveCourseAction({ title: title.trim(), categoryId });
      if (!result.ok) {
        setError(result.message ?? "No se ha podido crear el curso");
        return;
      }
      setTitle("");
      setError(null);
      if (result.id) router.push(`/admin/cursos/${result.id}`);
    });

  if (categories.length === 0) {
    return (
      <p className="rounded-[10px] border border-dashed border-line px-4 py-3 text-[13px] text-muted">
        Crea primero una categoría: todo curso pertenece a una.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <input
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          onKeyDown={(event) => event.key === "Enter" && title.trim() && create()}
          placeholder="Título del nuevo curso"
          aria-label="Título del nuevo curso"
          className="min-w-0 flex-1 basis-64 rounded-[10px] border border-line bg-card px-3 py-2.5 text-sm outline-none placeholder:text-subtle focus:border-line-strong"
        />
        <select
          value={categoryId}
          onChange={(event) => setCategoryId(event.target.value)}
          aria-label="Categoría"
          className="rounded-[10px] border border-line bg-card px-3 py-2.5 text-sm outline-none focus:border-line-strong"
        >
          {categories.map((category) => (
            <option key={category.id} value={category.id}>
              {category.name}
            </option>
          ))}
        </select>
        <Button variant="primary" size="md" onClick={create} disabled={pending || !title.trim()}>
          <Plus className="size-3.5" strokeWidth={2} />
          Crear curso
        </Button>
      </div>
      {error ? <p className="text-[12px] text-danger">{error}</p> : null}
    </div>
  );
}
