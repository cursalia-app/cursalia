import { headers } from "next/headers";
import type { NextRequest } from "next/server";

/**
 * IP del cliente tal y como la ve la plataforma.
 * En Vercel llega en `x-forwarded-for`; el primer valor es el cliente real y el
 * resto son proxies intermedios.
 */
export function clientIpFrom(request: NextRequest): string | null {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }

  return request.headers.get("x-real-ip");
}

/**
 * Igual que `clientIpFrom`, pero pensado para server actions, donde no hay
 * NextRequest a mano y se accede a las cabeceras vía la API de Next.
 */
export async function serverActionClientIp(): Promise<string | null> {
  const h = await headers();
  const forwarded = h.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  return h.get("x-real-ip");
}

/**
 * Huella de navegador estable y sin librerías: no identifica a una persona, solo
 * distingue un aparato de otro. Se calcula en el cliente y viaja al servidor.
 */
export function isValidFingerprint(value: unknown): value is string {
  return typeof value === "string" && value.length >= 8 && value.length <= 128;
}
