import { NextResponse, type NextRequest } from "next/server";
import { handleWebhookEvent } from "@/lib/services/billing-service";
import { MissingConfigError } from "@/lib/env";

/**
 * Entrada de eventos de la pasarela. Se lee el cuerpo CRUDO: la firma se calcula
 * sobre los bytes exactos que llegaron, no sobre un JSON reserializado.
 */

/** Un evento de la pasarela pesa unos cientos de bytes. Cualquier cosa por
 * encima de 16 KB es abuso, no un pago legítimo. */
const MAX_BODY_BYTES = 16 * 1024;
/** SHA-256 en hexadecimal ocupa 64 caracteres; con prefijo `sha256=` no supera
 * 128. Rechazar antes evita comparaciones sobre buffers gigantes. */
const MAX_SIGNATURE_LENGTH = 256;

export async function POST(request: NextRequest) {
  const contentLength = Number(request.headers.get("content-length") ?? "");
  if (Number.isFinite(contentLength) && contentLength > MAX_BODY_BYTES) {
    return NextResponse.json({ error: "payload_too_large" }, { status: 413 });
  }

  const signature =
    request.headers.get("x-cursalia-signature") ?? request.headers.get("x-signature");

  if (signature && signature.length > MAX_SIGNATURE_LENGTH) {
    return NextResponse.json({ error: "invalid_signature" }, { status: 401 });
  }

  const rawBody = await request.text();
  if (Buffer.byteLength(rawBody, "utf8") > MAX_BODY_BYTES) {
    return NextResponse.json({ error: "payload_too_large" }, { status: 413 });
  }

  let result;
  try {
    result = await handleWebhookEvent(rawBody, signature);
  } catch (error) {
    if (error instanceof MissingConfigError) {
      // Sin secreto configurado no se puede verificar nada: mejor rechazar.
      return NextResponse.json({ error: "not_configured" }, { status: 503 });
    }
    throw error;
  }

  switch (result.status) {
    case "invalid_signature":
      return NextResponse.json({ error: "invalid_signature" }, { status: 401 });
    case "invalid_payload":
      return NextResponse.json({ error: result.reason }, { status: 400 });
    default:
      // Duplicado, ignorado y procesado responden 200: la pasarela no debe reintentar.
      return NextResponse.json(result, { status: 200 });
  }
}
