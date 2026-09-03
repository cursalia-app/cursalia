import { beforeEach, describe, expect, it, vi } from "vitest";
import { asClient, fail, ok, SupabaseStub, type SupabaseStubConfig } from "@/lib/services/testing/supabase-stub";

const createSupabaseServerClient = vi.hoisted(() => vi.fn());
const createSupabaseAdminClient = vi.hoisted(() => vi.fn());
const getAccessState = vi.hoisted(() => vi.fn());

vi.mock("@/lib/supabase/server", () => ({ createSupabaseServerClient }));
vi.mock("@/lib/supabase/admin", () => ({ createSupabaseAdminClient }));
vi.mock("@/lib/services/access-service", () => ({ getAccessState }));

const {
  SelfReferralError,
  SubscriptionRequiredError,
  activateAffiliate,
  attachReferral,
  generateCommissionForPayment,
  maskEmail,
} = await import("@/lib/services/affiliate-service");
const { clearSettingsCache } = await import("@/lib/services/settings-service");

const AFFILIATE = "11111111-1111-1111-1111-111111111111";
const REFERRED = "22222222-2222-2222-2222-222222222222";
const PAYMENT = "33333333-3333-3333-3333-333333333333";

function stub(config: SupabaseStubConfig): SupabaseStub {
  const instance = new SupabaseStub(config);
  createSupabaseServerClient.mockResolvedValue(asClient(instance));
  createSupabaseAdminClient.mockReturnValue(asClient(instance));
  return instance;
}

beforeEach(() => {
  vi.clearAllMocks();
  clearSettingsCache();
  getAccessState.mockResolvedValue({ kind: "subscribed", renewsAt: null });
});

describe("activateAffiliate", () => {
  it("exige suscripción activa: la prueba no basta (RN-10)", async () => {
    getAccessState.mockResolvedValue({ kind: "trial", trialEndsAt: "2026-09-03T12:30:00.000Z" });
    stub({ tables: {} });

    await expect(activateAffiliate(AFFILIATE)).rejects.toBeInstanceOf(SubscriptionRequiredError);
  });

  it("es idempotente: activar dos veces devuelve el mismo código", async () => {
    stub({
      tables: {
        affiliate_profiles: ok({
          user_id: AFFILIATE,
          code: "ALVARO24",
          activated_at: "2026-08-01T00:00:00.000Z",
        }),
      },
    });

    await expect(activateAffiliate(AFFILIATE)).resolves.toEqual({
      userId: AFFILIATE,
      code: "ALVARO24",
      activatedAt: "2026-08-01T00:00:00.000Z",
    });
  });
});

describe("attachReferral", () => {
  it("nadie puede referirse a sí mismo (RN-12)", async () => {
    stub({ rpc: { resolve_referral_code: ok(AFFILIATE) } });

    await expect(attachReferral(AFFILIATE, "ALVARO24")).rejects.toBeInstanceOf(SelfReferralError);
  });

  it("un código inexistente no rompe el registro: simplemente no atribuye", async () => {
    const instance = stub({ rpc: { resolve_referral_code: ok(null) } });

    await expect(attachReferral(REFERRED, "NOEXISTE")).resolves.toBeUndefined();
    expect(instance.queryFor("profiles")).toBeUndefined();
  });

  it("la atribución es inmutable: solo escribe si no había ninguna", async () => {
    const instance = stub({ rpc: { resolve_referral_code: ok(AFFILIATE) }, tables: { profiles: ok(null) } });

    await attachReferral(REFERRED, "ALVARO24");

    const query = instance.queryFor("profiles");
    expect(query?.argsOf("update")?.[0]).toEqual({ referred_by: AFFILIATE });
    expect(query?.argsOf("is")).toEqual(["referred_by", null]);
  });
});

describe("generateCommissionForPayment", () => {
  it("las mensualidades no generan comisión (RN-11)", async () => {
    const instance = stub({
      tables: { payments: ok({ id: PAYMENT, user_id: REFERRED, type: "recurring" }) },
    });

    await expect(generateCommissionForPayment(PAYMENT)).resolves.toBeNull();
    expect(instance.queryFor("commissions")).toBeUndefined();
  });

  it("sin afiliado detrás del referido no hay nada que pagar", async () => {
    const instance = stub({
      tables: {
        payments: ok({ id: PAYMENT, user_id: REFERRED, type: "entry" }),
        profiles: ok({ id: REFERRED, referred_by: null }),
      },
    });

    await expect(generateCommissionForPayment(PAYMENT)).resolves.toBeNull();
    expect(instance.queryFor("commissions")).toBeUndefined();
  });

  it("congela el importe vigente en la fila de la comisión", async () => {
    const instance = stub({
      tables: {
        payments: ok({ id: PAYMENT, user_id: REFERRED, type: "entry" }),
        profiles: ok({ id: REFERRED, referred_by: AFFILIATE }),
        app_settings: ok({ value: 3000 }),
        commissions: ok({ id: "commission_1" }),
        audit_log: ok(null),
      },
    });

    await expect(generateCommissionForPayment(PAYMENT)).resolves.toBe("commission_1");

    expect(instance.queryFor("commissions")?.argsOf("insert")?.[0]).toEqual({
      affiliate_user_id: AFFILIATE,
      referred_user_id: REFERRED,
      payment_id: PAYMENT,
      amount_cents: 3000,
    });
  });

  it("un webhook repetido no duplica la comisión: la unicidad de la tabla manda", async () => {
    stub({
      tables: {
        payments: ok({ id: PAYMENT, user_id: REFERRED, type: "entry" }),
        profiles: ok({ id: REFERRED, referred_by: AFFILIATE }),
        app_settings: ok({ value: 3000 }),
        commissions: fail("duplicate key value violates unique constraint", "23505"),
      },
    });

    await expect(generateCommissionForPayment(PAYMENT)).resolves.toBeNull();
  });

  it("cualquier otro error sí se propaga", async () => {
    stub({
      tables: {
        payments: ok({ id: PAYMENT, user_id: REFERRED, type: "entry" }),
        profiles: ok({ id: REFERRED, referred_by: AFFILIATE }),
        app_settings: ok({ value: 3000 }),
        commissions: fail("connection reset", "08006"),
      },
    });

    await expect(generateCommissionForPayment(PAYMENT)).rejects.toThrow("connection reset");
  });
});

describe("maskEmail", () => {
  it("el afiliado ve a quién trajo, pero no su correo entero", () => {
    expect(maskEmail("alvaro@gmail.com")).toBe("a••••@gmail.com");
  });
});
