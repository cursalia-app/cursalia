import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/supabase/server";
import { AccessDeniedError, VideoNotFoundError, getSignedVideoUrl } from "@/lib/services/video-service";
import { clientIpFrom } from "@/lib/http/request";

/**
 * Única puerta por la que sale una URL de vídeo. El handler es fino: identifica
 * al usuario, delega en el servicio y traduce el resultado a HTTP.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ lessonId: string }> },
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  const { lessonId } = await params;

  try {
    const signed = await getSignedVideoUrl(lessonId, user.id, clientIpFrom(request));
    // Nunca se cachea: la URL es de un solo usuario, una sola IP y caduca.
    return NextResponse.json(signed, {
      headers: { "Cache-Control": "no-store, private" },
    });
  } catch (error) {
    if (error instanceof AccessDeniedError) {
      return NextResponse.json({ error: "access_denied" }, { status: 403 });
    }
    if (error instanceof VideoNotFoundError) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    throw error;
  }
}
