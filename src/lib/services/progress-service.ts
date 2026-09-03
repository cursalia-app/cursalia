import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { ContinueItem, CourseProgress } from "@/lib/types/domain";

/**
 * Progreso del alumno. SIEMPRE en la hoja: el segundo de un capítulo o la página
 * de un libro. Los porcentajes de tema, curso y global se calculan aquí a partir
 * de esas filas y no se guardan en ninguna columna, para que no puedan
 * desincronizarse.
 *
 * Ningún otro módulo escribe en lesson_progress ni en book_progress.
 */

/** Un capítulo se da por visto al llegar a este punto. */
const COMPLETION_RATIO = 0.9;

/** Mínimo entre dos guardados de la misma posición: el reproductor avisa a menudo. */
const SAVE_THROTTLE_MS = 5_000;

const lastSavedAt = new Map<string, number>();

export async function saveLessonPosition(
  userId: string,
  lessonId: string,
  seconds: number,
): Promise<void> {
  const key = `${userId}:${lessonId}`;
  const now = Date.now();
  const previous = lastSavedAt.get(key);
  if (previous !== undefined && now - previous < SAVE_THROTTLE_MS) return;
  lastSavedAt.set(key, now);

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("lesson_progress").upsert(
    {
      user_id: userId,
      lesson_id: lessonId,
      last_position_seconds: Math.max(0, Math.floor(seconds)),
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id,lesson_id" },
  );

  if (error) throw new Error(`progress-service: ${error.message}`);
}

export async function setLessonCompleted(
  userId: string,
  lessonId: string,
  completed: boolean,
): Promise<void> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("lesson_progress").upsert(
    {
      user_id: userId,
      lesson_id: lessonId,
      completed_at: completed ? new Date().toISOString() : null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id,lesson_id" },
  );

  if (error) throw new Error(`progress-service: ${error.message}`);
}

export async function saveBookPage(userId: string, bookId: string, page: number): Promise<void> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("book_progress").upsert(
    {
      user_id: userId,
      book_id: bookId,
      last_page: Math.max(1, Math.floor(page)),
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id,book_id" },
  );

  if (error) throw new Error(`progress-service: ${error.message}`);
}

/** ¿Ha llegado la reproducción al punto en que el capítulo se da por visto? */
export function reachedCompletion(positionSeconds: number, durationSeconds: number): boolean {
  if (durationSeconds <= 0) return false;
  return positionSeconds / durationSeconds >= COMPLETION_RATIO;
}

interface LessonWithProgressRow {
  id: string;
  position: number;
  modules: { course_id: string; position: number } | null;
  lesson_progress: { completed_at: string | null; updated_at: string }[];
}

/**
 * Progreso de un curso, calculado en el momento. Una sola consulta: capítulos del
 * curso con el progreso del usuario incrustado.
 */
export async function getCourseProgress(userId: string, courseId: string): Promise<CourseProgress> {
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase
    .from("lessons")
    .select("id, position, modules!inner(course_id, position), lesson_progress(completed_at, updated_at)")
    .eq("modules.course_id", courseId)
    .eq("is_published", true)
    .returns<LessonWithProgressRow[]>();

  if (error) throw new Error(`progress-service: ${error.message}`);

  const lessons = [...(data ?? [])].sort(byCoursePosition);
  const completed = lessons.filter((lesson) => lesson.lesson_progress.some((p) => p.completed_at));
  const firstPending = lessons.find((lesson) => !lesson.lesson_progress.some((p) => p.completed_at));

  return {
    completedLessons: completed.length,
    totalLessons: lessons.length,
    ratio: lessons.length === 0 ? 0 : completed.length / lessons.length,
    resumeLessonId: firstPending?.id ?? null,
  };
}

function byCoursePosition(a: LessonWithProgressRow, b: LessonWithProgressRow): number {
  const moduleDelta = (a.modules?.position ?? 0) - (b.modules?.position ?? 0);
  return moduleDelta !== 0 ? moduleDelta : a.position - b.position;
}

interface ContinueLessonRow {
  lesson_id: string;
  updated_at: string;
  completed_at: string | null;
  lessons: {
    id: string;
    title: string;
    modules: {
      course_id: string;
      courses: {
        id: string;
        slug: string;
        title: string;
        description: string | null;
        cover_url: string | null;
        status: "draft" | "published" | "archived";
        published_at: string | null;
        category_id: string;
        categories: { name: string } | null;
      } | null;
    } | null;
  } | null;
}

interface ContinueBookRow {
  book_id: string;
  last_page: number;
  updated_at: string;
  completed_at: string | null;
  books: {
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
  } | null;
}

/**
 * Pantalla de inicio: cursos y libros a medias, mezclados y ordenados por la
 * última actividad. Dos consultas, nunca una por elemento.
 */
export async function getContinueItems(userId: string, limit = 12): Promise<ContinueItem[]> {
  const supabase = await createSupabaseServerClient();

  const [lessonResult, bookResult] = await Promise.all([
    supabase
      .from("lesson_progress")
      .select(
        "lesson_id, updated_at, completed_at, lessons!inner(id, title, modules!inner(course_id, courses!inner(id, slug, title, description, cover_url, status, published_at, category_id, categories(name))))",
      )
      .eq("user_id", userId)
      .order("updated_at", { ascending: false })
      .limit(limit * 6)
      .returns<ContinueLessonRow[]>(),
    supabase
      .from("book_progress")
      .select(
        "book_id, last_page, updated_at, completed_at, books!inner(id, slug, title, author, description, cover_url, page_count, is_downloadable, status, published_at)",
      )
      .eq("user_id", userId)
      .is("completed_at", null)
      .order("updated_at", { ascending: false })
      .limit(limit)
      .returns<ContinueBookRow[]>(),
  ]);

  if (lessonResult.error) throw new Error(`progress-service: ${lessonResult.error.message}`);
  if (bookResult.error) throw new Error(`progress-service: ${bookResult.error.message}`);

  const items: ContinueItem[] = [];

  // Solo la actividad más reciente de cada curso: un curso aparece una vez.
  const seenCourses = new Set<string>();
  for (const row of lessonResult.data ?? []) {
    const course = row.lessons?.modules?.courses;
    if (!course || seenCourses.has(course.id)) continue;
    seenCourses.add(course.id);

    const progress = await getCourseProgress(userId, course.id);
    if (progress.resumeLessonId === null) continue;

    items.push({
      kind: "course",
      course: {
        id: course.id,
        slug: course.slug,
        title: course.title,
        description: course.description ?? "",
        categoryId: course.category_id,
        categoryName: course.categories?.name ?? "",
        status: course.status,
        coverUrl: course.cover_url,
        moduleCount: 0,
        lessonCount: progress.totalLessons,
        durationSeconds: 0,
        publishedAt: course.published_at,
        progress,
      },
      resumeLessonId: progress.resumeLessonId,
      resumeLessonTitle: row.lessons?.title ?? "",
      updatedAt: row.updated_at,
    });
  }

  for (const row of bookResult.data ?? []) {
    const book = row.books;
    if (!book) continue;

    items.push({
      kind: "book",
      book: {
        id: book.id,
        slug: book.slug,
        title: book.title,
        author: book.author,
        description: book.description ?? "",
        coverUrl: book.cover_url,
        pageCount: book.page_count,
        isDownloadable: book.is_downloadable,
        status: book.status,
        publishedAt: book.published_at,
        progress: {
          lastPage: row.last_page,
          completedAt: row.completed_at,
          ratio: book.page_count === 0 ? 0 : row.last_page / book.page_count,
        },
      },
      resumePage: row.last_page,
      updatedAt: row.updated_at,
    });
  }

  return items.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, limit);
}

/** Solo para los tests: el acelerador de guardado vive en memoria del proceso. */
export function clearSaveThrottle(): void {
  lastSavedAt.clear();
}
