import { beforeEach, describe, expect, it, vi } from "vitest";

const requireCurrentUserId = vi.hoisted(() => vi.fn());
const checkRateLimit = vi.hoisted(() => vi.fn());
const searchCatalog = vi.hoisted(() => vi.fn());

vi.mock("@/lib/supabase/server", () => ({ requireCurrentUserId }));
vi.mock("@/lib/services/rate-limit-service", () => ({ checkRateLimit }));
vi.mock("@/lib/services/search-service", () => ({ searchCatalog }));

const { searchCatalogAction } = await import("@/lib/actions/search-actions");

beforeEach(() => {
  vi.clearAllMocks();
  requireCurrentUserId.mockResolvedValue("user-1");
  checkRateLimit.mockResolvedValue(true);
  searchCatalog.mockResolvedValue({ courses: [], books: [] });
});

describe("searchCatalogAction", () => {
  it("query <2 chars devuelve vacío sin llamar rate limit ni servicio", async () => {
    const result = await searchCatalogAction("a");
    expect(result).toEqual({ courses: [], books: [] });
    expect(requireCurrentUserId).not.toHaveBeenCalled();
    expect(checkRateLimit).not.toHaveBeenCalled();
    expect(searchCatalog).not.toHaveBeenCalled();
  });

  it("query >100 chars también rebota antes de tocar nada", async () => {
    const result = await searchCatalogAction("a".repeat(101));
    expect(result).toEqual({ courses: [], books: [] });
    expect(requireCurrentUserId).not.toHaveBeenCalled();
  });

  it("con query válido comprueba rate limit por user antes de buscar", async () => {
    await searchCatalogAction("algoritmos");

    expect(requireCurrentUserId).toHaveBeenCalledOnce();
    expect(checkRateLimit).toHaveBeenCalledWith({
      bucket: "search:global",
      actor: "user-1",
      max: 60,
      windowSeconds: 5 * 60,
    });
    expect(searchCatalog).toHaveBeenCalledWith("algoritmos", 5);
  });

  it("si el rate limit bloquea, devuelve vacío sin llamar al servicio", async () => {
    checkRateLimit.mockResolvedValue(false);
    const result = await searchCatalogAction("algoritmos");
    expect(result).toEqual({ courses: [], books: [] });
    expect(searchCatalog).not.toHaveBeenCalled();
  });

  it("devuelve el resultado del servicio tal cual", async () => {
    searchCatalog.mockResolvedValue({
      courses: [{ id: "c1", slug: "s", title: "T", category_name: "IA", cover_url: null }],
      books: [],
    });
    const result = await searchCatalogAction("algoritmos");
    expect(result.courses).toHaveLength(1);
    expect(result.books).toEqual([]);
  });
});
