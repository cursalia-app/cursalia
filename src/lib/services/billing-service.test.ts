import { createHmac } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { asClient, fail, ok, SupabaseStub, type SupabaseStubConfig } from "@/lib/services/testing/supabase-stub";

const createSupabaseServerClient = vi.hoisted(() => vi.fn());
const createSupabaseAdminClient = vi.hoisted(() => vi.fn());
const getServerEnv = vi.hoisted(() => vi.fn());
const generateCommissionForPayment = vi.hoisted(() => vi.fn());

vi.mock("@/lib/supabase/server", () => ({ createSupabaseServerClient }));
vi.mock("@/lib/supabase/admin", () => ({ createSupabaseAdminClient }));
vi.mock("@/lib/env", () => ({ getServerEnv, getPublicEnv: vi.fn() }));
vi.mock("@/lib/services/affiliate-service", () => ({ generateCommissionForPayment }));

const { handleWebhookEvent, verifySignature } = await import("@/lib/services/billing-service");

const SECRET = "secreto-de-pruebas";
const USER = "11111111-1111-1111-1111-111111111111";

function sign(body: string): string {
  return createHmac("sha256", SECRET).update(body).digest("hex");
}

function stub(config: SupabaseStubConfig): SupabaseStub {
  const instance = new SupabaseStub(config);
  createSupabaseServerClient.mockResolvedValue(asClient(instance));
  createSupabaseAdminClient.mockReturnValue(asClient(instance));
  return instance;
}

function paymentEvent(overrides: Record<string, unknown> = {}) {
  return JSON.stringify({
    id: "evt_1",
    type: "payment.succeeded",
    occurred_at: "2026-09-03T12:00:00.000Z",
    customer: { external_id: "cus_1", email: "alumno@cursalia.com" },
    payment: {
      external_id: "pay_1",
      amount_cents: 4900,
      currency: "EUR",
      kind: "entry",
      paid_at: "2026-09-03T12:00:00.000Z",
    },
    ...overrides,
  });
}

function subscriptionEvent(type: string, overrides: Record<string, unknown> = {}) {
  return JSON.stringify({
    id: `evt_${type}`,
    type,
    occurred_at: "2026-09-03T12:00:00.000Z",
    customer: { external_id: "cus_1", email: "alumno@cursalia.com" },
    subscription: { external_id: "sub_1", current_period_end: "2026-10-03T00:00:00.000Z" },
    ...overrides,
  });
}

/** Cliente conocido, evento nuevo, pago insertado sin problemas. */
function happyPath(overrides: SupabaseStubConfig = {}) {
  return stub({
    tables: {
      webhook_events: ok(null),
      profiles: ok({ id: USER }),
      payments: ok({ id: "payment_1" }),
      subscriptions: ok(null),
      audit_log: ok(null),
      ...overrides.tables,
    },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  getServerEnv.mockReturnValue({ PAYMENTS_WEBHOOK_SECRET: SECRET });
  generateCommissionForPayment.mockResolvedValue(null);
});

describe("verifySignature", () => {
  it("acepta la firma correcta, con o sin prefijo", () => {
    const body = paymentEvent();
    expect(verifySignature(body, sign(body), SECRET)).toBe(true);
    expect(verifySignature(body, `sha256=${sign(body)}`, SECRET)).toBe(true);
  });

  it("rechaza una firma de otro cuerpo", () => {
    expect(verifySignature(paymentEvent(), sign("otra cosa"), SECRET)).toBe(false);
  });

  it("rechaza una firma de longitud distinta sin reventar", () => {
    expect(verifySignature(paymentEvent(), "corta", SECRET)).toBe(false);
  });
});

describe("handleWebhookEvent", () => {
  it("rechaza lo que no viene firmado", async () => {
    happyPath();

    await expect(handleWebhookEvent(paymentEvent(), null)).resolves.toEqual({
      status: "invalid_signature",
    });
  });

  it("rechaza una firma inválida sin tocar la base de datos", async () => {
    const instance = happyPath();

    await handleWebhookEvent(paymentEvent(), "firma-falsa");

    expect(instance.queryFor("webhook_events")).toBeUndefined();
  });

  it("rechaza un cuerpo que no es JSON", async () => {
    happyPath();
    const body = "{no es json";

    await expect(handleWebhookEvent(body, sign(body))).resolves.toMatchObject({
      status: "invalid_payload",
    });
  });

  it("registra todo evento recibido antes de aplicarlo", async () => {
    const instance = happyPath();
    const body = paymentEvent();

    await handleWebhookEvent(body, sign(body));

    expect(instance.queryFor("webhook_events")?.argsOf("insert")?.[0]).toMatchObject({
      external_event_id: "evt_1",
    });
  });

  it("el mismo evento dos veces no se aplica dos veces", async () => {
    const instance = stub({
      tables: {
        webhook_events: fail("duplicate key value violates unique constraint", "23505"),
        profiles: ok({ id: USER }),
      },
    });
    const body = paymentEvent();

    await expect(handleWebhookEvent(body, sign(body))).resolves.toEqual({
      status: "duplicate",
      eventId: "evt_1",
    });
    expect(instance.queryFor("payments")).toBeUndefined();
    expect(generateCommissionForPayment).not.toHaveBeenCalled();
  });

  it("un pago de entrada dispara la generación de la comisión", async () => {
    const body = paymentEvent();
    happyPath();

    await expect(handleWebhookEvent(body, sign(body))).resolves.toEqual({
      status: "processed",
      eventId: "evt_1",
    });
    expect(generateCommissionForPayment).toHaveBeenCalledWith("payment_1");
  });

  it("guarda el importe tal y como llega, en céntimos", async () => {
    const instance = happyPath();
    const body = paymentEvent();

    await handleWebhookEvent(body, sign(body));

    expect(instance.queryFor("payments")?.argsOf("insert")?.[0]).toMatchObject({
      user_id: USER,
      type: "entry",
      amount_cents: 4900,
      external_payment_id: "pay_1",
    });
  });

  it("un cliente que no existe en la plataforma se ignora, no se inventa", async () => {
    stub({ tables: { webhook_events: ok(null), profiles: ok(null) } });
    const body = paymentEvent();

    await expect(handleWebhookEvent(body, sign(body))).resolves.toEqual({
      status: "ignored",
      reason: "cliente_desconocido",
    });
  });

  it("activa la suscripción y guarda la fecha de renovación", async () => {
    const instance = happyPath();
    const body = subscriptionEvent("subscription.activated");

    await handleWebhookEvent(body, sign(body));

    expect(instance.queries.subscriptions?.[1]?.argsOf("insert")?.[0]).toMatchObject({
      user_id: USER,
      status: "active",
      current_period_end: "2026-10-03T00:00:00.000Z",
      past_due_since: null,
    });
  });

  it("el impago arranca el periodo de cortesía en el momento del evento", async () => {
    const instance = happyPath();
    const body = subscriptionEvent("subscription.past_due");

    await handleWebhookEvent(body, sign(body));

    expect(instance.queries.subscriptions?.[1]?.argsOf("insert")?.[0]).toMatchObject({
      status: "past_due",
      past_due_since: "2026-09-03T12:00:00.000Z",
    });
  });

  it("un segundo aviso de impago no reinicia la cortesía", async () => {
    const instance = stub({
      tables: {
        webhook_events: ok(null),
        profiles: ok({ id: USER }),
        subscriptions: ok({ id: "sub_row", past_due_since: "2026-09-01T00:00:00.000Z" }),
        audit_log: ok(null),
      },
    });
    const body = subscriptionEvent("subscription.past_due", { id: "evt_past_due_2" });

    await handleWebhookEvent(body, sign(body));

    expect(instance.queries.subscriptions?.[1]?.argsOf("update")?.[0]).toMatchObject({
      past_due_since: "2026-09-01T00:00:00.000Z",
    });
  });

  it("la cancelación limpia la cortesía y deja fecha de baja", async () => {
    const instance = happyPath();
    const body = subscriptionEvent("subscription.canceled");

    await handleWebhookEvent(body, sign(body));

    expect(instance.queries.subscriptions?.[1]?.argsOf("insert")?.[0]).toMatchObject({
      status: "canceled",
      past_due_since: null,
      canceled_at: "2026-09-03T12:00:00.000Z",
    });
  });
});
