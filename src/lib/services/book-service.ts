import { getAccessExpiry, hasContentAccess } from "@/lib/services/access-service";
import { resolveExpiry, signUrl } from "@/lib/bunny/signing";
import { getBunnyStorageEnv } from "@/lib/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { AccessDeniedError } from "@/lib/services/video-service";
import type { BookWithProgress } from "@/lib/types/domain";

/**
 * Biblioteca. Mismas reglas que el vídeo: ninguna URL se emite sin comprobar el
 * acceso, y la que se emite caduca en min(4 h, fin del acceso).
 */

export interface SignedDocument {
  url: string;
  expiresAt: string;
  watermark: string;
  isDownloadable: boolean;
}

export class BookNotFoundError extends Error {
  constructor() {
    super("book_not_found");
    this.name = "BookNotFoundError";
  }
}

interface BookRowWithProgress {
  id: string;
  slug: string;
  title: string;
  author: string | null;
  description: string | null;
  cover_url: string | null;
  page_count: number;
  is_downloadable: boolean;
  status: "draft" | "published" | "archived";
  published_at: string | null;
  position: number;
  book_progress: { last_page: number; completed_at: string | null }[];
}

const BOOK_SELECT =
  "id, slug, title, author, description, cover_url, page_count, is_downloadable, status, published_at, position, book_progress(last_page, completed_at)";

export async function listBooks(): Promise<BookWithProgress[]> {
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase
    .from("books")
    .select(BOOK_SELECT)
    .eq("status", "published")
    .order("position", { ascending: true })
    .returns<BookRowWithProgress[]>();

  if (error) throw new Error(`book-service: ${error.message}`);

  return (data ?? []).map(toBookWithProgress);
}

export async function getBook(slug: string): Promise<BookWithProgress | null> {
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase
    .from("books")
    .select(BOOK_SELECT)
    .eq("slug", slug)
    .maybeSingle()
    .returns<BookRowWithProgress | null>();

  if (error) throw new Error(`book-service: ${error.message}`);
  return data ? toBookWithProgress(data) : null;
}

/** Página por la que iba el lector. 1 si no la ha abierto nunca. */
export async function getBookmark(bookId: string, userId: string): Promise<number> {
  const supabase = await createSupabaseServerClient();

  const { data } = await supabase
    .from("book_progress")
    .select("last_page")
    .eq("book_id", bookId)
    .eq("user_id", userId)
    .maybeSingle();

  return data?.last_page ?? 1;
}

export async function getSignedBookUrl(
  bookId: string,
  userId: string,
  ip: string | null,
): Promise<SignedDocument> {
  if (!(await hasContentAccess(userId))) throw new AccessDeniedError();
  if (!ip) throw new AccessDeniedError();

  const supabase = await createSupabaseServerClient();

  const [{ data: book }, { data: profile }] = await Promise.all([
    supabase
      .from("books")
      .select("id, file_path, is_downloadable, status")
      .eq("id", bookId)
      .maybeSingle(),
    supabase.from("profiles").select("email").eq("id", userId).maybeSingle(),
  ]);

  if (!book?.file_path) throw new BookNotFoundError();

  const env = getBunnyStorageEnv();
  const expiresAt = resolveExpiry(await getAccessExpiry(userId));

  const url = signUrl({
    securityKey: env.BUNNY_STORAGE_TOKEN_KEY,
    hostname: env.BUNNY_STORAGE_CDN_HOSTNAME,
    path: book.file_path.startsWith("/") ? book.file_path : `/${book.file_path}`,
    expiresAt,
    clientIp: ip,
  });

  return {
    url,
    expiresAt: expiresAt.toISOString(),
    watermark: profile?.email ?? "",
    // RN-09: la descarga es la excepción, no la norma.
    isDownloadable: book.is_downloadable,
  };
}

function toBookWithProgress(row: BookRowWithProgress): BookWithProgress {
  const progress = row.book_progress[0];

  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    author: row.author,
    description: row.description ?? "",
    coverUrl: row.cover_url,
    pageCount: row.page_count,
    isDownloadable: row.is_downloadable,
    status: row.status,
    publishedAt: row.published_at,
    progress: progress
      ? {
          lastPage: progress.last_page,
          completedAt: progress.completed_at,
          // El porcentaje se calcula sobre el total de páginas. Nunca se guarda.
          ratio: row.page_count === 0 ? 0 : progress.last_page / row.page_count,
        }
      : null,
  };
}
