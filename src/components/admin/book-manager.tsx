"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2 } from "lucide-react";
import { StatusControl } from "@/components/admin/status-control";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/primitives";
import { deleteContentAction, saveBookAction } from "@/lib/actions/admin-actions";
import type { AdminBook } from "@/lib/services/admin-query-service";

/**
 * Biblioteca. El archivo vive en Bunny Storage: aquí solo se guarda su ruta,
 * nunca el documento. La descarga está desactivada salvo que se marque (RN-09).
 */
export function BookManager({ books }: { books: AdminBook[] }) {
  const router = useRouter();
  const [message, setMessage] = React.useState<string | null>(null);
  const [pending, startTransition] = React.useTransition();
  const [draft, setDraft] = React.useState({ title: "", author: "", filePath: "", pageCount: "" });

  const notify = (result: { ok: boolean; message?: string }) => {
    setMessage(result.ok ? null : (result.message ?? "No se ha podido guardar."));
    if (result.ok) router.refresh();
  };

  const create = () =>
    startTransition(async () => {
      const result = await saveBookAction({
        title: draft.title.trim(),
        author: draft.author.trim() || null,
        filePath: draft.filePath.trim(),
        fileProvider: "bunny_storage",
        pageCount: Number(draft.pageCount),
        isDownloadable: false,
        position: books.length,
      });
      notify(result);
      if (result.ok) setDraft({ title: "", author: "", filePath: "", pageCount: "" });
    });

  const canCreate =
    draft.title.trim().length > 0 && draft.filePath.trim().length > 0 && Number(draft.pageCount) > 0;

  return (
    <div className="space-y-8">
      <Card className="p-5">
        <h2 className="mb-4 text-sm font-medium">Añadir libro</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <DraftField
            label="Título"
            value={draft.title}
            onChange={(value) => setDraft((d) => ({ ...d, title: value }))}
          />
          <DraftField
            label="Autor"
            value={draft.author}
            onChange={(value) => setDraft((d) => ({ ...d, author: value }))}
          />
          <DraftField
            label="Ruta del archivo en Bunny Storage"
            value={draft.filePath}
            onChange={(value) => setDraft((d) => ({ ...d, filePath: value }))}
            placeholder="/libros/el-oficio-de-programar.pdf"
            mono
          />
          <DraftField
            label="Número de páginas"
            value={draft.pageCount}
            onChange={(value) => setDraft((d) => ({ ...d, pageCount: value.replace(/\D/g, "") }))}
            mono
          />
        </div>

        <div className="mt-4 flex items-center gap-3">
          <Button variant="primary" size="sm" onClick={create} disabled={pending || !canCreate}>
            <Plus className="size-3.5" strokeWidth={2} />
            Crear libro
          </Button>
          {message ? <span className="text-[12px] text-danger">{message}</span> : null}
        </div>
        <p className="mt-3 text-[12px] leading-relaxed text-subtle">
          El número de páginas es la base del porcentaje leído, así que conviene que sea exacto.
        </p>
      </Card>

      <section className="space-y-2">
        <h2 className="mb-3 text-sm font-medium">
          Libros <span className="num text-subtle">({books.length})</span>
        </h2>

        {books.map((book) => (
          <BookRow key={book.id} book={book} onNotify={notify} />
        ))}

        {books.length === 0 ? (
          <p className="rounded-[10px] border border-dashed border-line px-5 py-10 text-center text-sm text-muted">
            La biblioteca está vacía.
          </p>
        ) : null}
      </section>
    </div>
  );
}

function BookRow({
  book,
  onNotify,
}: {
  book: AdminBook;
  onNotify: (result: { ok: boolean; message?: string }) => void;
}) {
  const [title, setTitle] = React.useState(book.title);
  const [downloadable, setDownloadable] = React.useState(book.isDownloadable);
  const [, startTransition] = React.useTransition();

  const save = (overrides: Record<string, unknown> = {}) =>
    startTransition(async () => {
      onNotify(
        await saveBookAction({
          id: book.id,
          title,
          author: book.author,
          filePath: book.filePath,
          fileProvider: "bunny_storage",
          pageCount: book.pageCount,
          isDownloadable: downloadable,
          ...overrides,
        }),
      );
    });

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-[10px] border border-line bg-card px-4 py-3">
      <input
        value={title}
        onChange={(event) => setTitle(event.target.value)}
        onBlur={() => title !== book.title && save()}
        aria-label="Título del libro"
        className="min-w-0 flex-1 basis-48 rounded-lg border border-transparent bg-transparent px-2 py-1 text-sm outline-none transition-colors hover:border-line focus:border-line-strong focus:bg-background"
      />

      <span className="num text-[11px] text-subtle">{book.pageCount} pág.</span>

      <label className="flex items-center gap-2 text-[12px] text-muted">
        <input
          type="checkbox"
          checked={downloadable}
          onChange={(event) => {
            setDownloadable(event.target.checked);
            save({ isDownloadable: event.target.checked });
          }}
          className="size-3.5 accent-white"
        />
        Descargable
      </label>

      <StatusControl entity="book" id={book.id} status={book.status} />

      <Button
        variant="ghost"
        size="icon-sm"
        aria-label="Eliminar libro"
        onClick={() =>
          startTransition(async () => {
            onNotify(await deleteContentAction({ entity: "book", id: book.id }));
          })
        }
      >
        <Trash2 className="size-3.5" strokeWidth={1.75} />
      </Button>
    </div>
  );
}

function DraftField({
  label,
  value,
  onChange,
  placeholder,
  mono = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  mono?: boolean;
}) {
  const id = `libro-${label.toLowerCase().replace(/\s+/g, "-").slice(0, 24)}`;
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="text-[11px] uppercase tracking-wider text-subtle">
        {label}
      </label>
      <input
        id={id}
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        className={`w-full rounded-[10px] border border-line bg-background px-3 py-2.5 text-sm outline-none placeholder:text-subtle focus:border-line-strong ${mono ? "num" : ""}`}
      />
    </div>
  );
}
