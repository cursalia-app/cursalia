import { NextResponse, type NextRequest } from "next/server";
import { handleWebhookEvent } from "@/lib/services/billing-service";
import { MissingConfigError } from "@/lib/env";

/**
 * Entrada de eventos de la pasarela. Se lee el cuerpo CRUDO: la firma se calcula
 * sobre los bytes exactos que llegaron, no sobre un JSON reserializado.
 */
export async function POST(request: NextRequest) {
  const rawBody = await request.text();
  const signature =
    request.headers.get("x-cursalia-signature") ?? request.headers.get("x-signature");

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
