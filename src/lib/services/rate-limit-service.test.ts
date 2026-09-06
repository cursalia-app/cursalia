import { beforeEach, describe, expect, it, vi } from "vitest";
import { asClient, fail, ok, SupabaseStub } from "@/lib/services/testing/supabase-stub";

const createSupabaseAdminClient = vi.hoisted(() => vi.fn());
vi.mock("@/lib/supabase/admin", () => ({ createSupabaseAdminClient }));

const { checkRateLimit } = await import("@/lib/services/rate-limit-service");

function stubRpc(response: ReturnType<typeof ok> | ReturnType<typeof fail>): SupabaseStub {
  const instance = new SupabaseStub({ rpc: { check_rate_limit: response } });
  createSupabaseAdminClient.mockReturnValue(asClient(instance));
  return instance;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("checkRateLimit", () => {
  it("permite cuando la RPC devuelve true", async () => {
    stubRpc(ok(true));
    const allowed = await checkRateLimit({
      bucket: "auth:signin",
      actor: "1.2.3.4",
      max: 5,
      windowSeconds: 900,
    });
    expect(allowed).toBe(true);
  });

  it("bloquea cuando la RPC devuelve false", async () => {
    stubRpc(ok(false));
    const allowed = await checkRateLimit({
      bucket: "auth:signin",
      actor: "1.2.3.4",
      max: 5,
      windowSeconds: 900,
    });
    expect(allowed).toBe(false);
  });

  it("propaga a la RPC el bucket, el actor y los umbrales exactos", async () => {
    const instance = stubRpc(ok(true));
    await checkRateLimit({
      bucket: "signed:video",
      actor: "user-123",
      max: 30,
      windowSeconds: 3600,
    });

    expect(instance.rpcCalls).toEqual([
      {
        method: "check_rate_limit",
        args: [{ bucket: "signed:video", actor: "user-123", max_events: 30, window_seconds: 3600 }],
      },
    ]);
  });

  it("fail-open: si la BD falla, se permite (y se avisa por consola)", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    stubRpc(fail("connection refused"));

    const allowed = await checkRateLimit({
      bucket: "auth:signin",
      actor: "1.2.3.4",
      max: 5,
      windowSeconds: 900,
    });

    expect(allowed).toBe(true);
    expect(consoleError).toHaveBeenCalled();
    consoleError.mockRestore();
  });
});
