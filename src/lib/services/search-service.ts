import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Búsqueda global del catálogo. Se apoya en la RPC `search_catalog` que corre
 * como security invoker: RLS decide qué es visible; un usuario sin sesión no
 * ve borradores, un admin sí. La normalización (case + acentos) la hace la
 * base de datos con la extensión unaccent, así que "diseno" empata "Diseño".
 */

export interface SearchCourseHit {
  id: string;
  slug: string;
  title: string;
  category_name: string;
  cover_url: string | null;
}

export interface SearchBookHit {
  id: string;
  slug: string;
  title: string;
  author: string | null;
  cover_url: string | null;
}

export interface SearchResults {
  courses: SearchCourseHit[];
  books: SearchBookHit[];
}

const EMPTY: SearchResults = { courses: [], books: [] };

export async function searchCatalog(query: string, limit = 5): Promise<SearchResults> {
  const trimmed = query.trim();
  if (trimmed.length < 2) return EMPTY;

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("search_catalog", {
    query: trimmed,
    max_results: Math.min(Math.max(limit, 1), 10),
  });

  if (error || !data || typeof data !== "object") return EMPTY;

  const payload = data as { courses?: unknown; books?: unknown };
  return {
    courses: Array.isArray(payload.courses) ? (payload.courses as SearchCourseHit[]) : [],
    books: Array.isArray(payload.books) ? (payload.books as SearchBookHit[]) : [],
  };
}
