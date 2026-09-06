import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { asClient, ok, SupabaseStub, type SupabaseStubConfig } from "@/lib/services/testing/supabase-stub";

const createSupabaseServerClient = vi.hoisted(() => vi.fn());
const getBunnyStorageEnv = vi.hoisted(() => vi.fn());

vi.mock("@/lib/supabase/server", () => ({ createSupabaseServerClient }));
vi.mock("@/lib/supabase/admin", () => ({ createSupabaseAdminClient: vi.fn() }));
vi.mock("@/lib/env", () => ({
  getBunnyStorageEnv,
  getPublicEnv: vi.fn(),
  MissingConfigError: class extends Error {},
}));

const { BookNotFoundError, getSignedBookUrl } = await import("@/lib/services/book-service");
const { AccessDeniedError } = await import("@/lib/services/video-service");

const USER = "11111111-1111-1111-1111-111111111111";
const BOOK = "22222222-2222-2222-2222-222222222222";
const NOW = new Date("2026-09-03T12:00:00.000Z");

function stub(config: SupabaseStubConfig): SupabaseStub {
  const instance = new SupabaseStub(config);
  createSupabaseServerClient.mockResolvedValue(asClient(instance));
  return instance;
}

function grantedScenario(overrides: SupabaseStubConfig = {}) {
  return stub({
    rpc: {
      has_content_access: ok(true),
      access_expires_at: ok("2026-09-03T20:00:00.000Z"),
      ...overrides.rpc,
    },
    tables: {
      books: ok({
        id: BOOK,
        file_path: "/libros/curso.pdf",
        is_downloadable: false,
        status: "published",
      }),
      profiles: ok({ email: "alumno@cursalia.com" }),
      ...overrides.tables,
    },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(NOW);

  getBunnyStorageEnv.mockReturnValue({
    BUNNY_STORAGE_TOKEN_KEY: "clave-secreta",
    BUNNY_STORAGE_CDN_HOSTNAME: "storage-test.b-cdn.net",
    BUNNY_STORAGE_ZONE: "cursalia",
    BUNNY_STORAGE_API_KEY: "api",
  });
});

afterEach(() => vi.useRealTimers());

describe("getSignedBookUrl", () => {
  it("un usuario sin acceso NO obtiene ninguna URL firmada", async () => {
    const instance = grantedScenario({ rpc: { has_content_access: ok(false) } });
    await expect(getSignedBookUrl(BOOK, USER, "10.0.0.1")).rejects.toBeInstanceOf(
      AccessDeniedError,
    );
    // El acceso se corta antes de tocar la base o Bunny.
    expect(instance.queryFor("books")).toBeUndefined();
  });

  it("sin IP no se emite URL: una URL desatada valdría desde cualquier sitio", async () => {
    const instance = grantedScenario();
    await expect(getSignedBookUrl(BOOK, USER, null)).rejects.toBeInstanceOf(AccessDeniedError);
    expect(instance.queryFor("books")).toBeUndefined();
  });

  it("emite URL firmada con IP y devuelve el watermark del usuario", async () => {
    grantedScenario();

    const signed = await getSignedBookUrl(BOOK, USER, "10.0.0.1");
    const url = new URL(signed.url);

    expect(url.hostname).toBe("storage-test.b-cdn.net");
    expect(url.pathname).toBe("/libros/curso.pdf");
    expect(url.searchParams.get("token")).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(url.searchParams.get("token_ip")).toBe("10.0.0.1");
    expect(signed.watermark).toBe("alumno@cursalia.com");
    expect(signed.isDownloadable).toBe(false);
  });

  it("propaga el flag is_downloadable del libro", async () => {
    grantedScenario({
      tables: {
        books: ok({
          id: BOOK,
          file_path: "/libros/otro.pdf",
          is_downloadable: true,
          status: "published",
        }),
      },
    });

    const signed = await getSignedBookUrl(BOOK, USER, "10.0.0.1");
    expect(signed.isDownloadable).toBe(true);
  });

  it("un libro sin file_path no se puede servir", async () => {
    grantedScenario({
      tables: {
        books: ok({ id: BOOK, file_path: null, is_downloadable: false, status: "published" }),
      },
    });
    await expect(getSignedBookUrl(BOOK, USER, "10.0.0.1")).rejects.toBeInstanceOf(
      BookNotFoundError,
    );
  });

  it("la URL caduca al acabar el acceso si eso ocurre antes de las 4 horas", async () => {
    grantedScenario({ rpc: { access_expires_at: ok("2026-09-03T12:30:00.000Z") } });
    const signed = await getSignedBookUrl(BOOK, USER, "10.0.0.1");
    expect(signed.expiresAt).toBe("2026-09-03T12:30:00.000Z");
  });

  it("nunca dura más de 4 horas, aunque el acceso llegue muy lejos", async () => {
    grantedScenario({ rpc: { access_expires_at: ok("2027-01-01T00:00:00.000Z") } });
    const signed = await getSignedBookUrl(BOOK, USER, "10.0.0.1");
    expect(signed.expiresAt).toBe("2026-09-03T16:00:00.000Z");
  });

  it("la firma cambia con la IP: la URL de un usuario no sirve para otro equipo", async () => {
    grantedScenario();
    const a = await getSignedBookUrl(BOOK, USER, "10.0.0.1");
    grantedScenario();
    const b = await getSignedBookUrl(BOOK, USER, "10.0.0.2");

    expect(new URL(a.url).searchParams.get("token")).not.toBe(
      new URL(b.url).searchParams.get("token"),
    );
  });
});
