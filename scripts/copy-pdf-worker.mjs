#!/usr/bin/env node
/**
 * Copia el worker de pdf.js a /public.
 *
 * pdf.js necesita cargar su worker desde una URL propia. Resolverlo a través del
 * empaquetador es frágil y cambia con cada versión, así que se sirve como
 * archivo estático: el visor apunta a `/pdf.worker.min.mjs` y punto.
 *
 * Se ejecuta en `postinstall`, de modo que un clon recién instalado ya lo tiene.
 * Por eso el archivo copiado no se versiona.
 */

import { copyFile, mkdir } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

try {
  const source = path.join(path.dirname(require.resolve("pdfjs-dist/package.json")), "build", "pdf.worker.min.mjs");
  const target = path.join(process.cwd(), "public", "pdf.worker.min.mjs");

  await mkdir(path.dirname(target), { recursive: true });
  await copyFile(source, target);

  console.log("pdf.js worker copiado a public/pdf.worker.min.mjs");
} catch (error) {
  // No debe romper la instalación: el visor avisará si el worker no está.
  console.warn("No se ha podido copiar el worker de pdf.js:", error instanceof Error ? error.message : error);
}
