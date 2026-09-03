import { getAccessExpiry, hasContentAccess } from "@/lib/services/access-service";
import { resolveExpiry, signUrl } from "@/lib/bunny/signing";
import { getServerEnv } from "@/lib/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Frontera con Bunny Stream. Es el ÚNICO módulo que sabe cómo se sirve un vídeo:
 * cambiar de proveedor reescribe este archivo y nada más.
 *
 * Ninguna URL sale de aquí sin haber preguntado antes a access-service (RN-07).
 */

export interface SignedVideo {
  url: string;
  expiresAt: string;
  /** Correo del usuario, que el reproductor superpone como marca de agua. */
  watermark: string;
}

export type EncodingStatus =
  | "created"
  | "uploaded"
  | "processing"
  | "transcoding"
  | "finished"
  | "error";

export class AccessDeniedError extends Error {
  constructor() {
    super("access_denied");
    this.name = "AccessDeniedError";
  }
}

export class VideoNotFoundError extends Error {
  constructor() {
    super("video_not_found");
    this.name = "VideoNotFoundError";
  }
}

/**
 * URL firmada de un capítulo. Se comprueba el acceso, se recorta la caducidad al
 * fin del acceso y se ata la URL a la IP que la pidió.
 */
export async function getSignedVideoUrl(
  lessonId: string,
  userId: string,
  ip: string | null,
): Promise<SignedVideo> {
  // Primero el acceso. Si no lo hay, no se toca la base de datos ni Bunny.
  if (!(await hasContentAccess(userId))) throw new AccessDeniedError();

  const supabase = await createSupabaseServerClient();

  const [{ data: lesson }, { data: profile }] = await Promise.all([
    supabase
      .from("lessons")
      .select("id, video_id, video_provider, is_published")
      .eq("id", lessonId)
      .maybeSingle(),
    supabase.from("profiles").select("email").eq("id", userId).maybeSingle(),
  ]);

  if (!lesson?.video_id || !lesson.is_published) throw new VideoNotFoundError();

  const env = getServerEnv();
  const expiresAt = resolveExpiry(await getAccessExpiry(userId));

  const url = signUrl({
    securityKey: env.BUNNY_STREAM_TOKEN_KEY,
    hostname: env.BUNNY_STREAM_CDN_HOSTNAME,
    path: `/${lesson.video_id}/playlist.m3u8`,
    expiresAt,
    clientIp: ip,
  });

  return {
    url,
    expiresAt: expiresAt.toISOString(),
    watermark: profile?.email ?? "",
  };
}

const BUNNY_API = "https://video.bunnycdn.com";

/** Alta de un vídeo en Bunny para poder subir el archivo después. */
export async function createVideo(title: string): Promise<{ videoId: string }> {
  const env = getServerEnv();

  const response = await fetch(`${BUNNY_API}/library/${env.BUNNY_STREAM_LIBRARY_ID}/videos`, {
    method: "POST",
    headers: {
      AccessKey: env.BUNNY_STREAM_API_KEY,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ title }),
  });

  if (!response.ok) {
    throw new Error(`video-service: Bunny respondió ${response.status} al crear el vídeo`);
  }

  const payload: unknown = await response.json();
  const videoId = readString(payload, "guid");
  if (!videoId) throw new Error("video-service: Bunny no devolvió identificador de vídeo");

  return { videoId };
}

/** Estado de codificación. Un capítulo no debería publicarse antes de `finished`. */
export async function getVideoStatus(videoId: string): Promise<EncodingStatus> {
  const env = getServerEnv();

  const response = await fetch(
    `${BUNNY_API}/library/${env.BUNNY_STREAM_LIBRARY_ID}/videos/${videoId}`,
    { headers: { AccessKey: env.BUNNY_STREAM_API_KEY } },
  );

  if (!response.ok) throw new VideoNotFoundError();

  const payload: unknown = await response.json();
  return toEncodingStatus(readNumber(payload, "status"));
}

/** Duración en segundos que Bunny calcula tras codificar. */
export async function getVideoDuration(videoId: string): Promise<number | null> {
  const env = getServerEnv();

  const response = await fetch(
    `${BUNNY_API}/library/${env.BUNNY_STREAM_LIBRARY_ID}/videos/${videoId}`,
    { headers: { AccessKey: env.BUNNY_STREAM_API_KEY } },
  );

  if (!response.ok) return null;

  const payload: unknown = await response.json();
  const length = readNumber(payload, "length");
  return length !== null && length > 0 ? Math.round(length) : null;
}

/** Códigos de Bunny Stream, traducidos a algo que se pueda leer en el panel. */
function toEncodingStatus(code: number | null): EncodingStatus {
  switch (code) {
    case 0:
      return "created";
    case 1:
      return "uploaded";
    case 2:
      return "processing";
    case 3:
      return "transcoding";
    case 4:
      return "finished";
    default:
      return "error";
  }
}

function readString(payload: unknown, key: string): string | null {
  if (typeof payload !== "object" || payload === null) return null;
  const value = (payload as Record<string, unknown>)[key];
  return typeof value === "string" ? value : null;
}

function readNumber(payload: unknown, key: string): number | null {
  if (typeof payload !== "object" || payload === null) return null;
  const value = (payload as Record<string, unknown>)[key];
  return typeof value === "number" ? value : null;
}
