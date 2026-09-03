"use client";

import * as React from "react";
import type { PDFDocumentProxy } from "pdfjs-dist";

/**
 * Renderizado de una página del PDF sobre un canvas.
 *
 * Solo canvas, sin capa de texto: el libro se lee, no se copia. Es coherente con
 * que la descarga esté desactivada salvo que se marque (RN-09), aunque como toda
 * medida de cliente sea disuasión y no protección.
 *
 * El worker se sirve como archivo estático desde /public: resolverlo a través del
 * empaquetador cambia con cada versión de pdf.js y se rompe en silencio.
 */

const WORKER_SRC = "/pdf.worker.min.mjs";
/** Más de 2x de densidad no se aprecia y multiplica la memoria del canvas. */
const MAX_PIXEL_RATIO = 2;

async function loadPdfjs() {
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = WORKER_SRC;
  return pdfjs;
}

export function PdfPage({
  url,
  page,
  onDocumentLoaded,
  onError,
}: {
  url: string;
  page: number;
  onDocumentLoaded: (pageCount: number) => void;
  onError: (message: string) => void;
}) {
  const containerRef = React.useRef<HTMLDivElement>(null);
  const canvasRef = React.useRef<HTMLCanvasElement>(null);
  const [document, setDocument] = React.useState<PDFDocumentProxy | null>(null);
  const [containerHeight, setContainerHeight] = React.useState(0);

  // Los callbacks van por referencia para que no reinicien la carga del documento.
  const loadedRef = React.useRef(onDocumentLoaded);
  const errorRef = React.useRef(onError);

  React.useEffect(() => {
    loadedRef.current = onDocumentLoaded;
    errorRef.current = onError;
  });

  /* Carga del documento: una sola vez por URL firmada. */
  React.useEffect(() => {
    let cancelled = false;
    let destroy: (() => void) | undefined;

    void loadPdfjs()
      .then((pdfjs) => {
        const task = pdfjs.getDocument({ url });
        destroy = () => void task.destroy();
        return task.promise;
      })
      .then((pdf) => {
        if (cancelled) return;
        setDocument(pdf);
        loadedRef.current(pdf.numPages);
      })
      .catch(() => {
        if (cancelled) return;
        errorRef.current(
          "No se ha podido leer el archivo. Si acaba de configurarse el almacenamiento, revisa que la zona de Bunny permita peticiones desde este dominio.",
        );
      });

    return () => {
      cancelled = true;
      destroy?.();
    };
  }, [url]);

  /* La página se ajusta al alto disponible, y se vuelve a dibujar si cambia. */
  React.useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const observer = new ResizeObserver((entries) => {
      const height = entries[0]?.contentRect.height ?? 0;
      setContainerHeight(Math.round(height));
    });

    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  React.useEffect(() => {
    if (!document || containerHeight === 0) return;

    let cancelled = false;
    let cancelRender: (() => void) | undefined;

    void (async () => {
      const pdfPage = await document.getPage(Math.min(page, document.numPages));
      const canvas = canvasRef.current;
      if (cancelled || !canvas) return;

      const base = pdfPage.getViewport({ scale: 1 });
      const ratio = Math.min(window.devicePixelRatio || 1, MAX_PIXEL_RATIO);
      const scale = containerHeight / base.height;
      const viewport = pdfPage.getViewport({ scale: scale * ratio });

      canvas.width = Math.floor(viewport.width);
      canvas.height = Math.floor(viewport.height);
      canvas.style.width = `${Math.floor(viewport.width / ratio)}px`;
      canvas.style.height = `${Math.floor(viewport.height / ratio)}px`;

      const task = pdfPage.render({ canvas, viewport });
      cancelRender = () => task.cancel();
      await task.promise;
    })().catch(() => {
      // Cancelar un render en curso lanza: es lo normal al pasar hoja deprisa.
    });

    return () => {
      cancelled = true;
      cancelRender?.();
    };
  }, [document, page, containerHeight]);

  return (
    <div ref={containerRef} className="flex size-full items-center justify-center">
      <canvas ref={canvasRef} className="max-h-full max-w-full" aria-label={`Página ${page}`} />
    </div>
  );
}
