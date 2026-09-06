"use server";

import { requireCurrentUserId } from "@/lib/supabase/server";
import { checkRateLimit } from "@/lib/services/rate-limit-service";
import { searchCatalog, type SearchResults } from "@/lib/services/search-service";

/**
 * Server action que alimenta la búsqueda global de la barra lateral. Devuelve
 * un shape estable siempre, aunque no haya resultados: el consumidor cliente
 * no necesita comprobar tipos.
 *
 * Rate limit generoso pero real (60 búsquedas cada 5 min por usuario): teclear
 * "algoritmos" son 10 llamadas debounced, pero un bot que dispara 1000/min se
 * corta antes de tocar la base.
 */
const EMPTY: SearchResults = { courses: [], books: [] };

export async function searchCatalogAction(query: string): Promise<SearchResults> {
  const trimmed = query.trim();
  if (trimmed.length < 2 || trimmed.length > 100) return EMPTY;

  const userId = await requireCurrentUserId();

  const allowed = await checkRateLimit({
    bucket: "search:global",
    actor: userId,
    max: 60,
    windowSeconds: 5 * 60,
  });
  if (!allowed) return EMPTY;

  return searchCatalog(trimmed, 5);
}
