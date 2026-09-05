import { createHash } from "node:crypto";

/**
 * Firma de URLs de Bunny (Token Authentication).
 * Es la pieza de más bajo nivel de la frontera con el proveedor: solo sabe de
 * criptografía y de rutas. La lógica de negocio —quién tiene acceso y hasta
 * cuándo— vive en video-service y book-service, nunca aquí.
 *
 * Cambiar de proveedor de vídeo toca este archivo y esos dos servicios. Nada más.
 */

/** Caducidad máxima de cualquier URL firmada (RN-07). */
export const MAX_SIGNED_URL_SECONDS = 4 * 60 * 60;

export interface SignOptions {
  securityKey: string;
  hostname: string;
  /** Ruta con barra inicial, tal y como la ve el CDN. */
  path: string;
  expiresAt: Date;
  /**
   * IP del cliente al que se ata la URL. Es OBLIGATORIA: una URL sin IP vale
   * desde cualquier sitio y anula la razón misma de firmar. Si no se conoce
   * la IP, no se firma; el llamante debe decidir qué hacer.
   */
  clientIp: string;
}

/** Error específico: el llamante no tiene forma de saber la IP del cliente. */
export class MissingClientIpError extends Error {
  constructor() {
    super("client_ip_required");
    this.name = "MissingClientIpError";
  }
}

/**
 * Caducidad efectiva: nunca más de 4 horas, y nunca más allá del fin del acceso.
 * Una URL emitida durante la prueba deja de servir en el mismo instante en que
 * la prueba acaba.
 */
export function resolveExpiry(accessExpiresAt: Date | null, now = new Date()): Date {
  const hardLimit = new Date(now.getTime() + MAX_SIGNED_URL_SECONDS * 1000);
  if (!accessExpiresAt) return hardLimit;
  return accessExpiresAt < hardLimit ? accessExpiresAt : hardLimit;
}

/**
 * Token de Bunny: sha256 en base64url de la clave, la ruta, la caducidad y,
 * opcionalmente, la IP del cliente.
 */
export function signUrl({ securityKey, hostname, path, expiresAt, clientIp }: SignOptions): string {
  if (!clientIp) throw new MissingClientIpError();

  const expires = Math.floor(expiresAt.getTime() / 1000);
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;

  const token = createHash("sha256")
    .update(`${securityKey}${normalizedPath}${expires}${clientIp}`)
    .digest("base64")
    .replace(/\n/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=/g, "");

  const url = new URL(`https://${hostname}${normalizedPath}`);
  url.searchParams.set("token", token);
  url.searchParams.set("expires", String(expires));
  url.searchParams.set("token_ip", clientIp);

  return url.toString();
}
