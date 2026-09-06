import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/supabase/server";
import { registerOrTouchDevice } from "@/lib/services/device-service";
import { checkRateLimit, RateLimits } from "@/lib/services/rate-limit-service";

const bodySchema = z.object({
  fingerprint: z.string().min(8).max(128),
});

/** Alta o refresco del dispositivo desde el que se está usando la cuenta (RN-08). */
export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  const allowed = await checkRateLimit({
    bucket: "device:register",
    actor: user.id,
    ...RateLimits.deviceRegister,
  });
  if (!allowed) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_payload" }, { status: 400 });
  }

  const result = await registerOrTouchDevice(
    user.id,
    parsed.data.fingerprint,
    request.headers.get("user-agent"),
  );

  if (result.status === "limit_reached") {
    return NextResponse.json(
      {
        error: "limit_reached",
        maxDevices: result.maxDevices,
        message: `Has alcanzado el máximo de ${result.maxDevices} dispositivos. Libera uno desde tu cuenta para entrar desde este.`,
      },
      { status: 409 },
    );
  }

  return NextResponse.json({ status: "allowed" });
}
