import { createSupabaseServerClient } from "@/lib/supabase/server";
import type {
  CategoryWithCourses,
  CourseProgress,
  CourseTree,
  CourseWithProgress,
  LessonContext,
} from "@/lib/types/domain";

/**
 * Lectura del catálogo.
 * La visibilidad real la imponen las policies RLS: un curso `draft` no llega
 * aquí aunque se pida por su identificador. Este servicio se ocupa de la forma
 * de los datos y de no disparar consultas por elemento.
 */

interface CatalogLessonRow {
  id: string;
  duration_seconds: number | null;
  is_published: boolean;
}

interface CatalogModuleRow {
  id: string;
  lessons: CatalogLessonRow[];
}

interface CatalogCourseRow {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  cover_url: string | null;
  status: "draft" | "published" | "archived";
  position: number;
  published_at: string | null;
  category_id: string;
  modules: CatalogModuleRow[];
}

interface CatalogCategoryRow {
  id: string;
  name: string;
  slug: string;
  position: number;
  courses: CatalogCourseRow[];
}

const CATALOG_SELECT =
  "id, name, slug, position, courses(id, slug, title, description, cover_url, status, position, published_at, category_id, modules(id, lessons(id, duration_seconds, is_published)))";

/**
 * Catálogo completo con el progreso incrustado. Dos consultas en total: una para
 * el árbol y otra para los capítulos ya completados por el usuario.
 */
export async function listCatalog(userId?: string): Promise<CategoryWithCourses[]> {
  const supabase = await createSupabaseServerClient();

  const [{ data, error }, completedLessonIds] = await Promise.all([
    supabase
      .from("categories")
      .select(CATALOG_SELECT)
      .eq("status", "published")
      .order("position", { ascending: true })
      .returns<CatalogCategoryRow[]>(),
    loadCompletedLessonIds(userId),
  ]);

  if (error) throw new Error(`catalog-service: ${error.message}`);

  return (data ?? []).map((category) => ({
    id: category.id,
    name: category.name,
    slug: category.slug,
    position: category.position,
    courses: category.courses
      .filter((course) => course.status === "published")
      .sort((a, b) => a.position - b.position)
      .map((course) => toCourseWithProgress(course, category.name, completedLessonIds, Boolean(userId))),
  }));
}

export async function listNewReleases(limit = 6): Promise<CourseWithProgress[]> {
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase
    .from("courses")
    .select(
      "id, slug, title, description, cover_url, status, position, published_at, category_id, categories(name), modules(id, lessons(id, duration_seconds, is_published))",
    )
    .eq("status", "published")
    .not("published_at", "is", null)
    .order("published_at", { ascending: false })
    .limit(limit)
    .returns<(CatalogCourseRow & { categories: { name: string } | null })[]>();

  if (error) throw new Error(`catalog-service: ${error.message}`);

  return (data ?? []).map((course) =>
    toCourseWithProgress(course, course.categories?.name ?? "", new Set(), false),
  );
}

interface TreeLessonRow extends CatalogLessonRow {
  title: string;
  position: number;
  lesson_progress: { last_position_seconds: number; completed_at: string | null }[];
}

interface TreeModuleRow {
  id: string;
  title: string;
  position: number;
  lessons: TreeLessonRow[];
}

interface TreeCourseRow {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  cover_url: string | null;
  status: "draft" | "published" | "archived";
  position: number;
  published_at: string | null;
  category_id: string;
  categories: { name: string } | null;
  modules: TreeModuleRow[];
}

/** Curso completo con temas, capítulos y estado de completado. UNA consulta. */
export async function getCourseTree(courseSlug: string): Promise<CourseTree | null> {
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase
    .from("courses")
    .select(
      "id, slug, title, description, cover_url, status, position, published_at, category_id, categories(name), modules(id, title, position, lessons(id, title, position, duration_seconds, is_published, lesson_progress(last_position_seconds, completed_at)))",
    )
    .eq("slug", courseSlug)
    .maybeSingle()
    .returns<TreeCourseRow | null>();

  if (error) throw new Error(`catalog-service: ${error.message}`);
  if (!data) return null;

  const modules = [...data.modules]
    .sort((a, b) => a.position - b.position)
    .map((module) => ({
      id: module.id,
      title: module.title,
      position: module.position,
      lessons: [...module.lessons]
        .filter((lesson) => lesson.is_published)
        .sort((a, b) => a.position - b.position)
        .map((lesson) => {
          const progress = lesson.lesson_progress[0];
          return {
            id: lesson.id,
            title: lesson.title,
            position: lesson.position,
            durationSeconds: lesson.duration_seconds ?? 0,
            progress: progress
              ? {
                  lastPositionSeconds: progress.last_position_seconds,
                  completedAt: progress.completed_at,
                }
              : undefined,
          };
        }),
    }));

  const lessons = modules.flatMap((module) => module.lessons);

  return {
    id: data.id,
    slug: data.slug,
    title: data.title,
    description: data.description ?? "",
    categoryId: data.category_id,
    categoryName: data.categories?.name ?? "",
    status: data.status,
    coverUrl: data.cover_url,
    moduleCount: modules.length,
    lessonCount: lessons.length,
    durationSeconds: lessons.reduce((acc, lesson) => acc + lesson.durationSeconds, 0),
    publishedAt: data.published_at,
    modules,
  };
}

/** Capítulo con su tema, su curso y los capítulos anterior y siguiente. */
export async function getLessonContext(lessonId: string): Promise<LessonContext | null> {
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase
    .from("lessons")
    .select("id, modules!inner(id, courses!inner(slug))")
    .eq("id", lessonId)
    .maybeSingle()
    .returns<{ id: string; modules: { id: string; courses: { slug: string } | null } | null } | null>();

  if (error) throw new Error(`catalog-service: ${error.message}`);

  const courseSlug = data?.modules?.courses?.slug;
  if (!courseSlug) return null;

  const tree = await getCourseTree(courseSlug);
  if (!tree) return null;

  const flat = tree.modules.flatMap((module) => module.lessons.map((lesson) => ({ module, lesson })));
  const index = flat.findIndex((entry) => entry.lesson.id === lessonId);
  if (index === -1) return null;

  const { module, lesson } = flat[index];
  return {
    course: { id: tree.id, slug: tree.slug, title: tree.title },
    module: { id: module.id, title: module.title },
    lesson,
    previousLessonId: flat[index - 1]?.lesson.id ?? null,
    nextLessonId: flat[index + 1]?.lesson.id ?? null,
  };
}

async function loadCompletedLessonIds(userId?: string): Promise<Set<string>> {
  if (!userId) return new Set();

  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("lesson_progress")
    .select("lesson_id, completed_at")
    .eq("user_id", userId)
    .not("completed_at", "is", null)
    .returns<{ lesson_id: string; completed_at: string | null }[]>();

  return new Set((data ?? []).map((row) => row.lesson_id));
}

function toCourseWithProgress(
  course: CatalogCourseRow,
  categoryName: string,
  completedLessonIds: Set<string>,
  withProgress: boolean,
): CourseWithProgress {
  const lessons = course.modules.flatMap((module) =>
    module.lessons.filter((lesson) => lesson.is_published),
  );

  return {
    id: course.id,
    slug: course.slug,
    title: course.title,
    description: course.description ?? "",
    categoryId: course.category_id,
    categoryName,
    status: course.status,
    coverUrl: course.cover_url,
    moduleCount: course.modules.length,
    lessonCount: lessons.length,
    durationSeconds: lessons.reduce((acc, lesson) => acc + (lesson.duration_seconds ?? 0), 0),
    publishedAt: course.published_at,
    progress: withProgress ? computeProgress(lessons, completedLessonIds) : null,
  };
}

/** El porcentaje se calcula aquí y ahora. Nunca se lee de una columna. */
function computeProgress(
  lessons: CatalogLessonRow[],
  completedLessonIds: Set<string>,
): CourseProgress | null {
  const completed = lessons.filter((lesson) => completedLessonIds.has(lesson.id));
  if (completed.length === 0) return null;

  const pending = lessons.find((lesson) => !completedLessonIds.has(lesson.id));

  return {
    completedLessons: completed.length,
    totalLessons: lessons.length,
    ratio: lessons.length === 0 ? 0 : completed.length / lessons.length,
    resumeLessonId: pending?.id ?? null,
  };
}
