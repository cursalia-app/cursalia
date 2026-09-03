import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  asClient,
  ok,
  SupabaseStub,
  type SupabaseStubConfig,
} from "@/lib/services/testing/supabase-stub";

const createSupabaseServerClient = vi.hoisted(() => vi.fn());
const createSupabaseAdminClient = vi.hoisted(() => vi.fn());

vi.mock("@/lib/supabase/server", () => ({ createSupabaseServerClient }));
vi.mock("@/lib/supabase/admin", () => ({ createSupabaseAdminClient }));

const { getAccessExpiry, getAccessState, hasContentAccess, startTrial } = await import(
  "@/lib/services/access-service"
);
const { clearSettingsCache } = await import("@/lib/services/settings-service");

const USER = "11111111-1111-1111-1111-111111111111";
const TRIAL_START = "2026-09-03T10:00:00.000Z";

function stub(config: SupabaseStubConfig): SupabaseStub {
  const instance = new SupabaseStub(config);
  createSupabaseServerClient.mockResolvedValue(asClient(instance));
  createSupabaseAdminClient.mockReturnValue(asClient(instance));
  return instance;
}

/** Estado por defecto: sin suscripción y sin prueba arrancada. */
function scenario(overrides: SupabaseStubConfig = {}): SupabaseStub {
  return stub({
    rpc: { has_content_access: ok(false), ...overrides.rpc },
    tables: {
      app_settings: ok({ value: 30 }),
      subscriptions: ok(null),
      profiles: ok({ trial_started_at: null }),
      ...overrides.tables,
    },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  clearSettingsCache();
});

describe("hasContentAccess", () => {
  it("devuelve lo que dice la función SQL, que es la única fuente de verdad", async () => {
    const instance = scenario({ rpc: { has_content_access: ok(true) } });

    await expect(hasContentAccess(USER)).resolves.toBe(true);
    expect(instance.rpcCalls).toEqual([{ method: "has_content_access", args: [{ uid: USER }] }]);
  });

  it("niega el acceso si la consulta falla: fallo seguro (RN-14)", async () => {
    scenario({ rpc: { has_content_access: { data: null, error: { message: "sin conexión" } } } });

    await expect(hasContentAccess(USER)).resolves.toBe(false);
  });

  it("no acepta nada que no sea exactamente `true`", async () => {
    scenario({ rpc: { has_content_access: ok(null) } });

    await expect(hasContentAccess(USER)).resolves.toBe(false);
  });
});

describe("getAccessState", () => {
  it("prueba no iniciada y sin suscripción: sin acceso", async () => {
    scenario();

    await expect(getAccessState(USER)).resolves.toEqual({ kind: "none" });
  });

  it("prueba viva: informa del momento exacto en que termina", async () => {
    scenario({
      rpc: { has_content_access: ok(true) },
      tables: { profiles: ok({ trial_started_at: TRIAL_START }) },
    });

    await expect(getAccessState(USER)).resolves.toEqual({
      kind: "trial",
      trialEndsAt: "2026-09-03T10:30:00.000Z",
    });
  });

  it("la prueba dura exactamente los minutos configurados, ni uno más", async () => {
    scenario({
      rpc: { has_content_access: ok(true) },
      tables: {
        profiles: ok({ trial_started_at: TRIAL_START }),
        app_settings: ok({ value: 30 }),
      },
    });

    const state = await getAccessState(USER);
    if (state.kind !== "trial") throw new Error("se esperaba una prueba en curso");

    const elapsedMs = new Date(state.trialEndsAt).getTime() - new Date(TRIAL_START).getTime();
    expect(elapsedMs).toBe(30 * 60 * 1000);
  });

  it("respeta una duración de prueba distinta si el ajuste cambia", async () => {
    scenario({
      rpc: { has_content_access: ok(true) },
      tables: {
        profiles: ok({ trial_started_at: TRIAL_START }),
        app_settings: ok({ value: 45 }),
      },
    });

    await expect(getAccessState(USER)).resolves.toEqual({
      kind: "trial",
      trialEndsAt: "2026-09-03T10:45:00.000Z",
    });
  });

  it("prueba expirada: la función SQL dice que no, y eso zanja el asunto", async () => {
    scenario({
      rpc: { has_content_access: ok(false) },
      tables: { profiles: ok({ trial_started_at: "2026-09-03T09:00:00.000Z" }) },
    });

    await expect(getAccessState(USER)).resolves.toEqual({ kind: "none" });
  });

  it("suscripción activa: manda sobre la prueba y muestra la renovación", async () => {
    scenario({
      rpc: { has_content_access: ok(true) },
      tables: {
        subscriptions: ok({
          status: "active",
          current_period_end: "2026-10-03T00:00:00.000Z",
          past_due_since: null,
        }),
        profiles: ok({ trial_started_at: TRIAL_START }),
      },
    });

    await expect(getAccessState(USER)).resolves.toEqual({
      kind: "subscribed",
      renewsAt: "2026-10-03T00:00:00.000Z",
    });
  });

  it("impago dentro de cortesía: hay acceso y se dice hasta cuándo (RN-15)", async () => {
    scenario({
      rpc: { has_content_access: ok(true) },
      tables: {
        subscriptions: ok({
          status: "past_due",
          current_period_end: null,
          past_due_since: "2026-09-02T00:00:00.000Z",
        }),
        app_settings: ok({ value: 3 }),
      },
    });

    await expect(getAccessState(USER)).resolves.toEqual({
      kind: "grace",
      graceEndsAt: "2026-09-05T00:00:00.000Z",
    });
  });

  it("impago fuera de cortesía: sin acceso", async () => {
    scenario({
      rpc: { has_content_access: ok(false) },
      tables: {
        subscriptions: ok({
          status: "past_due",
          current_period_end: null,
          past_due_since: "2026-08-01T00:00:00.000Z",
        }),
      },
    });

    await expect(getAccessState(USER)).resolves.toEqual({ kind: "none" });
  });

  it("suscripción cancelada: sin acceso, aunque quede periodo pagado por delante", async () => {
    scenario({
      rpc: { has_content_access: ok(false) },
      tables: {
        subscriptions: ok({
          status: "canceled",
          current_period_end: "2026-12-01T00:00:00.000Z",
          past_due_since: null,
        }),
      },
    });

    await expect(getAccessState(USER)).resolves.toEqual({ kind: "none" });
  });
});

describe("getAccessExpiry", () => {
  it("devuelve el instante que calcula la base de datos", async () => {
    scenario({ rpc: { access_expires_at: ok("2026-09-03T10:30:00.000Z") } });

    const expiry = await getAccessExpiry(USER);
    expect(expiry?.toISOString()).toBe("2026-09-03T10:30:00.000Z");
  });

  it("devuelve null si no hay fecha utilizable", async () => {
    scenario({ rpc: { access_expires_at: ok(null) } });

    await expect(getAccessExpiry(USER)).resolves.toBeNull();
  });
});

describe("startTrial", () => {
  it("es idempotente: solo escribe si la prueba no había arrancado", async () => {
    const instance = scenario();

    await startTrial(USER);

    const query = instance.queryFor("profiles");
    expect(query?.argsOf("update")?.[0]).toMatchObject({ trial_started_at: expect.any(String) });
    expect(query?.argsOf("is")).toEqual(["trial_started_at", null]);
  });
});
