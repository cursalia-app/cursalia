import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { asClient, fail, ok, SupabaseStub, type SupabaseStubConfig } from "@/lib/services/testing/supabase-stub";

const createSupabaseServerClient = vi.hoisted(() => vi.fn());
const createSupabaseAdminClient = vi.hoisted(() => vi.fn());

vi.mock("@/lib/supabase/server", () => ({ createSupabaseServerClient }));
vi.mock("@/lib/supabase/admin", () => ({ createSupabaseAdminClient }));

const { ReleaseCooldownError, describeDevice, registerOrTouchDevice, releaseDevice } = await import(
  "@/lib/services/device-service"
);
const { clearSettingsCache } = await import("@/lib/services/settings-service");

const USER = "11111111-1111-1111-1111-111111111111";
const NOW = new Date("2026-09-03T12:00:00.000Z");

function stub(config: SupabaseStubConfig): SupabaseStub {
  const instance = new SupabaseStub(config);
  createSupabaseServerClient.mockResolvedValue(asClient(instance));
  createSupabaseAdminClient.mockReturnValue(asClient(instance));
  return instance;
}

beforeEach(() => {
  vi.clearAllMocks();
  clearSettingsCache();
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});

afterEach(() => vi.useRealTimers());

describe("registerOrTouchDevice", () => {
  it("un dispositivo conocido y activo solo actualiza su última visita", async () => {
    const instance = stub({
      tables: {
        user_devices: ok({ id: "device_1", released_at: null }),
        app_settings: ok({ value: 4 }),
      },
    });

    await expect(registerOrTouchDevice(USER, "fp_a", "Mozilla/5.0")).resolves.toEqual({
      status: "allowed",
      deviceId: "device_1",
    });

    const updates = instance.queries.user_devices?.[1];
    expect(updates?.argsOf("update")?.[0]).toMatchObject({ last_seen_at: NOW.toISOString() });
  });

  it("el quinto dispositivo se rechaza con un mensaje claro, no con un error genérico", async () => {
    stub({
      tables: {
        user_devices: fail("device_limit_reached"),
        app_settings: ok({ value: 4 }),
      },
    });

    await expect(registerOrTouchDevice(USER, "fp_nuevo", null)).resolves.toEqual({
      status: "limit_reached",
      maxDevices: 4,
    });
  });

  it("confía el límite a la base de datos: no lo decide contando en la aplicación", async () => {
    const instance = stub({
      tables: { user_devices: fail("device_limit_reached"), app_settings: ok({ value: 4 }) },
    });

    await registerOrTouchDevice(USER, "fp_nuevo", null);

    // Se intenta insertar y es el trigger quien dice que no.
    const insertAttempt = instance.queries.user_devices?.some(
      (query) => query.argsOf("insert") !== undefined,
    );
    expect(insertAttempt).toBe(true);
  });

  it("propaga cualquier otro fallo en vez de disfrazarlo de límite alcanzado", async () => {
    stub({ tables: { user_devices: fail("connection reset"), app_settings: ok({ value: 4 }) } });

    await expect(registerOrTouchDevice(USER, "fp_nuevo", null)).rejects.toThrow("connection reset");
  });
});

describe("releaseDevice", () => {
  it("permite liberar si nunca se ha liberado nada", async () => {
    const instance = stub({
      tables: { user_devices: ok(null), app_settings: ok({ value: 30 }) },
    });

    await releaseDevice(USER, "device_2");

    const update = instance.queries.user_devices?.[1];
    expect(update?.argsOf("update")?.[0]).toMatchObject({ released_at: NOW.toISOString() });
  });

  it("rechaza una segunda liberación dentro de los 30 días", async () => {
    stub({
      tables: {
        user_devices: ok({ released_at: "2026-08-20T12:00:00.000Z" }),
        app_settings: ok({ value: 30 }),
      },
    });

    await expect(releaseDevice(USER, "device_2")).rejects.toBeInstanceOf(ReleaseCooldownError);
  });

  it("vuelve a permitirla pasado el plazo", async () => {
    stub({
      tables: {
        user_devices: ok({ released_at: "2026-07-01T12:00:00.000Z" }),
        app_settings: ok({ value: 30 }),
      },
    });

    await expect(releaseDevice(USER, "device_2")).resolves.toBeUndefined();
  });

  it("informa de cuándo se podrá volver a liberar", async () => {
    stub({
      tables: {
        user_devices: ok({ released_at: "2026-08-20T12:00:00.000Z" }),
        app_settings: ok({ value: 30 }),
      },
    });

    await expect(releaseDevice(USER, "device_2")).rejects.toMatchObject({
      availableAt: "2026-09-19T12:00:00.000Z",
    });
  });
});

describe("describeDevice", () => {
  it("traduce el user-agent a algo que una persona reconozca", () => {
    expect(
      describeDevice(
        "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Safari/604.1",
      ),
    ).toBe("Safari · iPhone");
    expect(describeDevice("Mozilla/5.0 (Windows NT 10.0; Win64) Chrome/120.0.0.0 Safari/537.36")).toBe(
      "Chrome · Windows",
    );
  });

  it("no inventa nada si no hay user-agent", () => {
    expect(describeDevice(null)).toBe("Dispositivo desconocido");
  });
});
