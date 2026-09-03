"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/primitives";
import { importCourseAction } from "@/lib/actions/admin-actions";
import type { AdminCategory } from "@/lib/services/admin-query-service";

/**
 * Importación de un curso completo desde un manifiesto.
 *
 * Es la vía para traer de golpe las carpetas que hoy viven en Drive: el guion de
 * ingesta sube los vídeos a Bunny y escupe este JSON. Todo entra en borrador,
 * para que nada se publique sin haberlo mirado antes.
 */
export function ImportForm({ categories }: { categories: AdminCategory[] }) {
  const router = useRouter();
  const [categoryId, setCategoryId] = React.useState(categories[0]?.id ?? "");
  const [raw, setRaw] = React.useState("");
  const [result, setResult] = React.useState<{ ok: boolean; message?: string } | null>(null);
  const [pending, startTransition] = React.useTransition();

  const submit = () => {
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      setResult({ ok: false, message: "El manifiesto no es un JSON válido." });
      return;
    }

    if (typeof parsed !== "object" || parsed === null) {
      setResult({ ok: false, message: "El manifiesto debe ser un objeto." });
      return;
    }

    startTransition(async () => {
      const response = await importCourseAction({ ...parsed, categoryId });
      setResult(response);
      if (response.ok) {
        setRaw("");
        router.refresh();
      }
    });
  };

  return (
    <div className="space-y-6">
      <Card className="p-5">
        <div className="space-y-4">
          <div className="space-y-1.5">
            <label htmlFor="categoria-destino" className="text-[11px] uppercase tracking-wider text-subtle">
              Categoría de destino
            </label>
            <select
              id="categoria-destino"
              value={categoryId}
              onChange={(event) => setCategoryId(event.target.value)}
              className="w-full max-w-sm rounded-[10px] border border-line bg-background px-3 py-2.5 text-sm outline-none focus:border-line-strong"
            >
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1.5">
            <label htmlFor="manifiesto" className="text-[11px] uppercase tracking-wider text-subtle">
              Manifiesto
            </label>
            <textarea
              id="manifiesto"
              rows={14}
              value={raw}
              onChange={(event) => setRaw(event.target.value)}
              placeholder={EXAMPLE}
              spellCheck={false}
              className="num w-full resize-y rounded-[10px] border border-line bg-background px-3 py-3 text-[12px] leading-relaxed outline-none placeholder:text-subtle focus:border-line-strong"
            />
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Button
              variant="primary"
              size="md"
              onClick={submit}
              disabled={pending || !raw.trim() || !categoryId}
            >
              <Upload className="size-3.5" strokeWidth={1.75} />
              {pending ? "Importando…" : "Importar curso"}
            </Button>

            {result ? (
              <span className={`text-[12px] ${result.ok ? "text-success" : "text-danger"}`}>
                {result.message ?? (result.ok ? "Importado." : "No se ha podido importar.")}
              </span>
            ) : null}
          </div>
        </div>
      </Card>

      <Card className="p-5">
        <h2 className="text-sm font-medium">Cómo se trae una carpeta de Drive</h2>
        <ol className="mt-3 space-y-2 text-[13px] leading-relaxed text-muted">
          <li>
            <span className="num text-subtle">1.</span> El guion de ingesta recorre la carpeta y
            sube cada vídeo a Bunny Stream.
          </li>
          <li>
            <span className="num text-subtle">2.</span> Con los identificadores que devuelve Bunny,
            escribe un manifiesto como el del ejemplo.
          </li>
          <li>
            <span className="num text-subtle">3.</span> Se pega aquí y el curso aparece completo, en
            borrador, con sus temas y capítulos ordenados.
          </li>
          <li>
            <span className="num text-subtle">4.</span> Se revisa, se ajustan títulos si hace falta y
            se publica.
          </li>
        </ol>
        <p className="mt-4 text-[12px] leading-relaxed text-subtle">
          Un capítulo sin <span className="num">videoId</span> se crea igualmente: sirve para
          preparar el esqueleto del curso antes de tener los vídeos.
        </p>
      </Card>
    </div>
  );
}

const EXAMPLE = `{
  "title": "Fundamentos de IA generativa",
  "description": "Cómo funcionan por dentro los modelos de lenguaje.",
  "modules": [
    {
      "title": "Qué es un modelo de lenguaje",
      "lessons": [
        { "title": "Del texto a los tokens", "videoId": "8f3c...", "durationSeconds": 720 },
        { "title": "Atención, en cristiano", "videoId": "a91b..." }
      ]
    }
  ]
}`;
