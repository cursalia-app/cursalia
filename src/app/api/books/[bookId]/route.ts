import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/supabase/server";
import { BookNotFoundError, getSignedBookUrl } from "@/lib/services/book-service";
import { AccessDeniedError } from "@/lib/services/video-service";
import { checkRateLimit, RateLimits } from "@/lib/services/rate-limit-service";
import { clientIpFrom } from "@/lib/http/request";
import { MissingConfigError } from "@/lib/env";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ bookId: string }> },
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  const allowed = await checkRateLimit({
    bucket: "signed:book",
    actor: user.id,
    ...RateLimits.signedBook,
  });
  if (!allowed) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }

  const { bookId } = await params;

  try {
    const signed = await getSignedBookUrl(bookId, user.id, clientIpFrom(request));
    return NextResponse.json(signed, { headers: { "Cache-Control": "no-store, private" } });
  } catch (error) {
    if (error instanceof AccessDeniedError) {
      return NextResponse.json({ error: "access_denied" }, { status: 403 });
    }
    if (error instanceof MissingConfigError) {
      // Configuración incompleta, no un fallo del sistema: se dice qué falta.
      return NextResponse.json({ error: "not_configured", detail: error.message }, { status: 503 });
    }
    if (error instanceof BookNotFoundError) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    throw error;
  }
}
