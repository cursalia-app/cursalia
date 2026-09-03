#!/usr/bin/env node
/**
 * Ingesta masiva: una carpeta de vídeos -> Bunny Stream -> manifiesto de curso.
 *
 * Vive FUERA de la aplicación a propósito. Sube archivos grandes, tarda mucho y
 * se ejecuta a mano; no tiene sentido dentro de una petición web.
 *
 * Cómo se usa con Google Drive: sincroniza la carpeta con la aplicación de
 * escritorio de Drive y apunta este guion a la carpeta local. No hace falta la
 * API de Drive ni credenciales de Google.
 *
 * Estructura esperada:
 *   Curso de ejemplo/
 *     01 Primer tema/
 *       01 Del texto a los tokens.mp4
 *       02 Atención, en cristiano.mp4
 *     02 Segundo tema/
 *       01 Llamadas a la API.mp4
 *
 * Cada subcarpeta es un Tema y cada archivo un Capítulo. El prefijo numérico
 * solo sirve para ordenar: se elimina del título.
 *
 * Uso:
 *   node scripts/drive-to-bunny/index.mjs "D:/Drive/Curso de ejemplo" > curso.json
 *   node scripts/drive-to-bunny/index.mjs "D:/Drive/Curso" --dry-run
 *
 * Variables necesarias (de .env.local):
 *   BUNNY_STREAM_LIBRARY_ID, BUNNY_STREAM_API_KEY
 *
 * El JSON resultante se pega en el panel, en Importar. Todo entra en borrador.
 */

import { createReadStream } from "node:fs";
import { readdir, stat } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { Readable } from "node:stream";

const VIDEO_EXTENSIONS = new Set([".mp4", ".mov", ".m4v", ".mkv", ".webm", ".avi"]);
const BUNNY_API = "https://video.bunnycdn.com";

const [, , folder, ...flags] = process.argv;
const dryRun = flags.includes("--dry-run");

if (!folder) {
  console.error("Uso: node scripts/drive-to-bunny/index.mjs <carpeta> [--dry-run]");
  process.exit(1);
}

const libraryId = process.env.BUNNY_STREAM_LIBRARY_ID;
const apiKey = process.env.BUNNY_STREAM_API_KEY;

if (!dryRun && (!libraryId || !apiKey)) {
  console.error(
    "Faltan BUNNY_STREAM_LIBRARY_ID o BUNNY_STREAM_API_KEY. Expórtalas antes de ejecutar, o usa --dry-run.",
  );
  process.exit(1);
}

/** "01 Del texto a los tokens.mp4" -> "Del texto a los tokens" */
function toTitle(name) {
  return name
    .replace(/\.[^.]+$/, "")
    .replace(/^[\s\d]*[-._)]?\s*/, "")
    .trim();
}

function isVideo(name) {
  return VIDEO_EXTENSIONS.has(path.extname(name).toLowerCase());
}

async function listSorted(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  return entries.sort((a, b) => a.name.localeCompare(b.name, "es", { numeric: true }));
}

async function createVideo(title) {
  const response = await fetch(`${BUNNY_API}/library/${libraryId}/videos`, {
    method: "POST",
    headers: { AccessKey: apiKey, "Content-Type": "application/json" },
    body: JSON.stringify({ title }),
  });

  if (!response.ok) {
    throw new Error(`Bunny respondió ${response.status} al crear "${title}"`);
  }

  const payload = await response.json();
  return payload.guid;
}

async function uploadVideo(videoId, filePath) {
  const { size } = await stat(filePath);

  const response = await fetch(`${BUNNY_API}/library/${libraryId}/videos/${videoId}`, {
    method: "PUT",
    headers: { AccessKey: apiKey, "Content-Length": String(size) },
    body: Readable.toWeb(createReadStream(filePath)),
    duplex: "half",
  });

  if (!response.ok) {
    throw new Error(`Bunny respondió ${response.status} al subir ${path.basename(filePath)}`);
  }
}

async function main() {
  const root = path.resolve(folder);
  const courseTitle = toTitle(path.basename(root)) || path.basename(root);
  const entries = await listSorted(root);

  const modules = [];
  let uploaded = 0;

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;

    const moduleDir = path.join(root, entry.name);
    const files = (await listSorted(moduleDir)).filter((file) => file.isFile() && isVideo(file.name));
    if (files.length === 0) continue;

    const lessons = [];

    for (const file of files) {
      const filePath = path.join(moduleDir, file.name);
      const title = toTitle(file.name);

      if (dryRun) {
        // El progreso va a stderr para que stdout sea JSON limpio y redirigible.
        console.error(`· ${entry.name} / ${title}`);
        lessons.push({ title, videoId: null });
        continue;
      }

      console.error(`Subiendo ${entry.name} / ${title}…`);
      const videoId = await createVideo(title);
      await uploadVideo(videoId, filePath);
      uploaded++;
      lessons.push({ title, videoId });
    }

    modules.push({ title: toTitle(entry.name), lessons });
  }

  if (modules.length === 0) {
    console.error("No se ha encontrado ninguna subcarpeta con vídeos.");
    process.exit(1);
  }

  console.error(
    dryRun
      ? "\nSimulación terminada. Quita --dry-run para subir de verdad."
      : `\nSubidos ${uploaded} vídeos. Pega el JSON en el panel, en Importar.`,
  );

  // El manifiesto no lleva categoryId: se elige en el panel al importar.
  process.stdout.write(`${JSON.stringify({ title: courseTitle, modules }, null, 2)}\n`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
