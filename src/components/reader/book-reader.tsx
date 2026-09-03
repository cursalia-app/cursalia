"use client";

import * as React from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight, Download, X } from "lucide-react";
import { PdfPage } from "@/components/reader/pdf-page";
import { saveBookPageAction } from "@/lib/actions/learner-actions";
import { cn, formatPercent } from "@/lib/utils";

/** Cada cuántos milisegundos se persiste el marcapáginas tras dejar de pasar hojas. */
const SAVE_DEBOUNCE_MS = 1200;

export interface BookReaderProps {
  title: string;
  author: string | null;
  pageCount: number;
  startPage: number;
  isDownloadable: boolean;
  /** Identificador del libro: con él se pide al servidor la URL firmada (RN-07). */
  bookId: string;
  watermark: string;
}

export function BookReader({
  title,
  author,
  pageCount,
  startPage,
  isDownloadable,
  bookId,
  watermark,
}: BookReaderProps) {
  const [page, setPage] = React.useState(Math.min(Math.max(1, startPage), pageCount));
  const [chromeVisible, setChromeVisible] = React.useState(true);
  const [fileUrl, setFileUrl] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  /**
   * Páginas reales del documento. Manda sobre `page_count` de la ficha para
   * navegar: si alguien se equivocó al darlo de alta, el visor no se rompe.
   */
  const [loadedPages, setLoadedPages] = React.useState<number | null>(null);
  const hideTimer = React.useRef<number | null>(null);
  const lastPage = loadedPages ?? pageCount;

  /* La URL firmada la emite el servidor: caduca y va atada a la IP. */
  React.useEffect(() => {
    const controller = new AbortController();

    fetch(`/api/books/${bookId}`, { signal: controller.signal, cache: "no-store" })
      .then(async (response) => {
        if (response.ok) return ((await response.json()) as { url: string }).url;
        if (response.status === 403) throw new Error("Tu acceso ha terminado.");
        throw new Error("No se ha podido abrir el libro.");
      })
      .then(setFileUrl)
      .catch((cause: unknown) => {
        if (cause instanceof DOMException && cause.name === "AbortError") return;
        setError(cause instanceof Error ? cause.message : "No se ha podido abrir el libro.");
      });

    return () => controller.abort();
  }, [bookId]);

  /* El marcapáginas se guarda cuando el usuario se detiene, no en cada hoja. */
  React.useEffect(() => {
    const id = window.setTimeout(() => void saveBookPageAction(bookId, page), SAVE_DEBOUNCE_MS);
    return () => window.clearTimeout(id);
  }, [page, bookId]);

  const go = React.useCallback(
    (delta: number) => setPage((p) => Math.min(lastPage, Math.max(1, p + delta))),
    [lastPage],
  );

  React.useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "ArrowRight" || event.key === "PageDown") go(1);
      if (event.key === "ArrowLeft" || event.key === "PageUp") go(-1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [go]);

  const revealChrome = React.useCallback(() => {
    setChromeVisible(true);
    if (hideTimer.current) window.clearTimeout(hideTimer.current);
    hideTimer.current = window.setTimeout(() => setChromeVisible(false), 3000);
  }, []);

  /* Al abrir, la barra ya está visible: solo hay que programar su retirada. */
  React.useEffect(() => {
    const id = window.setTimeout(() => setChromeVisible(false), 3000);
    return () => {
      window.clearTimeout(id);
      if (hideTimer.current) window.clearTimeout(hideTimer.current);
    };
  }, []);

  const ratio = page / lastPage;

  return (
    <div
      onMouseMove={revealChrome}
      onTouchStart={revealChrome}
      className="fixed inset-0 z-40 flex flex-col bg-background"
    >
      {/* Barra superior fina que se retira sola: la lectura manda. */}
      <header
        className={cn(
          "absolute inset-x-0 top-0 z-10 flex h-14 items-center gap-3 border-b border-line bg-background/95 px-4 backdrop-blur transition-opacity duration-200",
          chromeVisible ? "opacity-100" : "pointer-events-none opacity-0",
        )}
      >
        <Link href="/libros" aria-label="Cerrar el visor" className="p-2 text-muted hover:text-foreground">
          <X className="size-4" strokeWidth={1.75} />
        </Link>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium tracking-[-0.01em]">{title}</p>
          {author ? <p className="truncate text-[11px] text-subtle">{author}</p> : null}
        </div>
        <span className="num hidden text-[11px] text-subtle sm:block">
          {formatPercent(ratio)} leído
        </span>
        {isDownloadable && fileUrl ? (
          <a
            href={fileUrl}
            download
            className="rounded-lg border border-line px-3 py-1.5 text-[12px] text-muted hover:border-line-strong hover:text-foreground"
          >
            <Download className="size-3.5" strokeWidth={1.75} />
          </a>
        ) : null}
      </header>

      {/* Superficie de página: pdf.js dibuja sobre la URL firmada. */}
      <div className="flex flex-1 items-center justify-center overflow-hidden px-4 py-16">
        <div
          className={cn(
            "relative h-full max-h-full max-w-full overflow-hidden rounded-[4px] border border-line bg-[#141414]",
            // Sin documento todavía, se reserva el hueco con proporción de folio.
            fileUrl && !error ? "w-auto" : "aspect-[1/1.414] w-auto",
          )}
        >
          {fileUrl && !error ? (
            <PdfPage url={fileUrl} page={page} onDocumentLoaded={setLoadedPages} onError={setError} />
          ) : (
            <div className="flex size-full flex-col items-center justify-center gap-2 px-8 text-center">
              <span className="num text-4xl text-line-strong">{page}</span>
              <p className="mt-2 text-sm text-muted">
                {error ? "No se puede abrir" : "Preparando el libro…"}
              </p>
              {error ? (
                <p className="max-w-xs text-xs leading-relaxed text-subtle">{error}</p>
              ) : null}
            </div>
          )}
          <span
            aria-hidden="true"
            className="num pointer-events-none absolute bottom-4 right-5 select-none text-[10px] text-foreground/[0.12]"
          >
            {watermark}
          </span>
        </div>
      </div>

      {/* Zonas de toque a los lados: pasar hoja en móvil sin buscar botones. */}
      <button
        type="button"
        onClick={() => go(-1)}
        aria-label="Página anterior"
        className="absolute inset-y-16 left-0 w-1/4 cursor-w-resize opacity-0"
      />
      <button
        type="button"
        onClick={() => go(1)}
        aria-label="Página siguiente"
        className="absolute inset-y-16 right-0 w-1/4 cursor-e-resize opacity-0"
      />

      <footer
        className={cn(
          "absolute inset-x-0 bottom-0 z-10 border-t border-line bg-background/95 px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur transition-opacity duration-200",
          chromeVisible ? "opacity-100" : "pointer-events-none opacity-0",
        )}
      >
        <div className="mx-auto flex max-w-2xl items-center gap-3">
          <button
            type="button"
            onClick={() => go(-1)}
            disabled={page === 1}
            aria-label="Página anterior"
            className="p-2 text-muted disabled:opacity-30 hover:text-foreground"
          >
            <ChevronLeft className="size-4" strokeWidth={1.75} />
          </button>

          <input
            type="range"
            min={1}
            max={lastPage}
            value={page}
            onChange={(e) => setPage(Number(e.target.value))}
            aria-label="Ir a página"
            className="h-1 flex-1 cursor-pointer appearance-none rounded-full bg-line [&::-webkit-slider-thumb]:size-3 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-primary"
            style={{
              background: `linear-gradient(to right, #fafafa ${ratio * 100}%, #262626 ${ratio * 100}%)`,
            }}
          />

          <span className="num w-20 shrink-0 text-center text-[11px] text-subtle">
            {page} / {lastPage}
          </span>

          <button
            type="button"
            onClick={() => go(1)}
            disabled={page === lastPage}
            aria-label="Página siguiente"
            className="p-2 text-muted disabled:opacity-30 hover:text-foreground"
          >
            <ChevronRight className="size-4" strokeWidth={1.75} />
          </button>
        </div>
      </footer>
    </div>
  );
}
