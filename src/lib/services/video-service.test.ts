import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { asClient, ok, SupabaseStub, type SupabaseStubConfig } from "@/lib/services/testing/supabase-stub";
import { MAX_SIGNED_URL_SECONDS, resolveExpiry } from "@/lib/bunny/signing";

const createSupabaseServerClient = vi.hoisted(() => vi.fn());
const getBunnyStreamEnv = vi.hoisted(() => vi.fn());

vi.mock("@/lib/supabase/server", () => ({ createSupabaseServerClient }));
vi.mock("@/lib/supabase/admin", () => ({ createSupabaseAdminClient: vi.fn() }));
vi.mock("@/lib/env", () => ({ getBunnyStreamEnv, getPublicEnv: vi.fn() }));

const { AccessDeniedError, VideoNotFoundError, getSignedVideoUrl } = await import(
  "@/lib/services/video-service"
);

const USER = "11111111-1111-1111-1111-111111111111";
const LESSON = "22222222-2222-2222-2222-222222222222";
const NOW = new Date("2026-09-03T12:00:00.000Z");

function stub(config: SupabaseStubConfig): SupabaseStub {
  const instance = new SupabaseStub(config);
  createSupabaseServerClient.mockResolvedValue(asClient(instance));
  return instance;
}

/** Con acceso concedido y un capítulo publicado con vídeo. */
function grantedScenario(overrides: SupabaseStubConfig = {}) {
  return stub({
    rpc: {
      has_content_access: ok(true),
      access_expires_at: ok("2026-09-03T20:00:00.000Z"),
      ...overrides.rpc,
    },
    tables: {
      lessons: ok({ id: LESSON, video_id: "vid_abc", video_provider: "bunny", is_published: true }),
      profiles: ok({ email: "alumno@cursalia.com" }),
      ...overrides.tables,
    },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(NOW);

  getBunnyStreamEnv.mockReturnValue({
    BUNNY_STREAM_TOKEN_KEY: "clave-secreta",
    BUNNY_STREAM_CDN_HOSTNAME: "vz-test.b-cdn.net",
    BUNNY_STREAM_LIBRARY_ID: "1234",
    BUNNY_STREAM_API_KEY: "api",
  });
});

afterEach(() => vi.useRealTimers());

describe("getSignedVideoUrl", () => {
  it("un usuario sin acceso NO obtiene ninguna URL firmada", async () => {
    grantedScenario({ rpc: { has_content_access: ok(false) } });

    await expect(getSignedVideoUrl(LESSON, USER, "10.0.0.1")).rejects.toBeInstanceOf(
      AccessDeniedError,
    );
  });

  it("comprueba el acceso ANTES de tocar la base de datos", async () => {
    const instance = grantedScenario({ rpc: { has_content_access: ok(false) } });

    await expect(getSignedVideoUrl(LESSON, USER, null)).rejects.toBeInstanceOf(AccessDeniedError);
    expect(instance.queryFor("lessons")).toBeUndefined();
  });

  it("emite una URL firmada, atada a la IP y con la marca de agua del usuario", async () => {
    grantedScenario();

    const signed = await getSignedVideoUrl(LESSON, USER, "10.0.0.1");
    const url = new URL(signed.url);

    expect(url.hostname).toBe("vz-test.b-cdn.net");
    expect(url.pathname).toBe("/vid_abc/playlist.m3u8");
    expect(url.searchParams.get("token")).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(url.searchParams.get("token_ip")).toBe("10.0.0.1");
    expect(signed.watermark).toBe("alumno@cursalia.com");
  });

  it("el token cambia si cambia la IP: una URL no vale para otro equipo", async () => {
    grantedScenario();
    const first = await getSignedVideoUrl(LESSON, USER, "10.0.0.1");
    grantedScenario();
    const second = await getSignedVideoUrl(LESSON, USER, "10.0.0.2");

    expect(new URL(first.url).searchParams.get("token")).not.toBe(
      new URL(second.url).searchParams.get("token"),
    );
  });

  it("la URL caduca al acabar la prueba si eso ocurre antes de las 4 horas", async () => {
    grantedScenario({ rpc: { access_expires_at: ok("2026-09-03T12:20:00.000Z") } });

    const signed = await getSignedVideoUrl(LESSON, USER, null);

    expect(signed.expiresAt).toBe("2026-09-03T12:20:00.000Z");
  });

  it("nunca dura más de 4 horas, aunque la suscripción llegue hasta el año que viene", async () => {
    grantedScenario({ rpc: { access_expires_at: ok("2027-01-01T00:00:00.000Z") } });

    const signed = await getSignedVideoUrl(LESSON, USER, null);

    expect(signed.expiresAt).toBe("2026-09-03T16:00:00.000Z");
  });

  it("un capítulo sin vídeo asociado no se puede reproducir", async () => {
    grantedScenario({
      tables: { lessons: ok({ id: LESSON, video_id: null, video_provider: "bunny", is_published: true }) },
    });

    await expect(getSignedVideoUrl(LESSON, USER, null)).rejects.toBeInstanceOf(VideoNotFoundError);
  });

  it("un capítulo sin publicar tampoco, ni siquiera con acceso", async () => {
    grantedScenario({
      tables: {
        lessons: ok({ id: LESSON, video_id: "vid_abc", video_provider: "bunny", is_published: false }),
      },
    });

    await expect(getSignedVideoUrl(LESSON, USER, null)).rejects.toBeInstanceOf(VideoNotFoundError);
  });
});

describe("resolveExpiry", () => {
  it("sin fecha de caducidad de acceso, el tope son 4 horas", () => {
    const expiry = resolveExpiry(null, NOW);
    expect(expiry.getTime() - NOW.getTime()).toBe(MAX_SIGNED_URL_SECONDS * 1000);
  });

  it("se queda con la más cercana de las dos", () => {
    const soon = new Date("2026-09-03T12:05:00.000Z");
    expect(resolveExpiry(soon, NOW)).toEqual(soon);
  });
});
