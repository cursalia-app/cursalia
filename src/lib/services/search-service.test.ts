import { beforeEach, describe, expect, it, vi } from "vitest";
import { asClient, fail, ok, SupabaseStub } from "@/lib/services/testing/supabase-stub";

const createSupabaseServerClient = vi.hoisted(() => vi.fn());
vi.mock("@/lib/supabase/server", () => ({ createSupabaseServerClient }));

const { searchCatalog } = await import("@/lib/services/search-service");

function stub(rpcResponse: ReturnType<typeof ok> | ReturnType<typeof fail>): SupabaseStub {
  const instance = new SupabaseStub({ rpc: { search_catalog: rpcResponse } });
  createSupabaseServerClient.mockResolvedValue(asClient(instance));
  return instance;
}

beforeEach(() => vi.clearAllMocks());

describe("searchCatalog", () => {
  it("con menos de 2 caracteres devuelve vacío sin tocar la base", async () => {
    const instance = stub(ok({ courses: [], books: [] }));

    const result = await searchCatalog("a");
    expect(result).toEqual({ courses: [], books: [] });
    expect(instance.rpcCalls).toHaveLength(0);
  });

  it("propaga el query recortado y el límite a la RPC", async () => {
    const instance = stub(ok({ courses: [], books: [] }));

    await searchCatalog("  diseño  ", 3);
    expect(instance.rpcCalls).toEqual([
      {
        method: "search_catalog",
        args: [{ query: "diseño", max_results: 3 }],
      },
    ]);
  });

  it("un límite exagerado se recorta a 10", async () => {
    const instance = stub(ok({ courses: [], books: [] }));
    await searchCatalog("hola", 999);
    expect(instance.rpcCalls[0]?.args[0]).toMatchObject({ max_results: 10 });
  });

  it("un límite <=0 se eleva a 1", async () => {
    const instance = stub(ok({ courses: [], books: [] }));
    await searchCatalog("hola", 0);
    expect(instance.rpcCalls[0]?.args[0]).toMatchObject({ max_results: 1 });
  });

  it("interpreta correctamente el shape con arrays de cursos y libros", async () => {
    stub(
      ok({
        courses: [
          { id: "c1", slug: "curso-1", title: "Curso 1", category_name: "IA", cover_url: null },
        ],
        books: [
          { id: "b1", slug: "libro-1", title: "Libro 1", author: "Autor", cover_url: null },
        ],
      }),
    );

    const result = await searchCatalog("curso");
    expect(result.courses).toHaveLength(1);
    expect(result.courses[0]?.title).toBe("Curso 1");
    expect(result.books[0]?.author).toBe("Autor");
  });

  it("ante un error de la RPC devuelve vacío (fail-safe)", async () => {
    stub(fail("timeout"));
    const result = await searchCatalog("algo");
    expect(result).toEqual({ courses: [], books: [] });
  });

  it("payloads no-object se tratan como vacíos", async () => {
    stub(ok("no soy un objeto" as unknown as { courses: []; books: [] }));
    const result = await searchCatalog("algo");
    expect(result).toEqual({ courses: [], books: [] });
  });

  it("payloads con claves incompletas no revientan", async () => {
    stub(ok({ courses: [{ id: "c1", slug: "s", title: "t", category_name: "x", cover_url: null }] }));
    const result = await searchCatalog("algo");
    expect(result.courses).toHaveLength(1);
    expect(result.books).toEqual([]);
  });
});
