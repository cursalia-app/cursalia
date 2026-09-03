import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { CommissionStatus, ContentStatus, SubscriptionStatus } from "@/lib/types/domain";

/**
 * Lecturas del panel de administración.
 *
 * A diferencia de catalog-service, aquí se ve TODO: borradores, archivados y
 * capítulos sin publicar. No hay ningún filtro de estado porque quien consulta
 * es un administrador, y eso lo comprueban las policies RLS, no este archivo.
 */

export interface AdminCategory {
  id: string;
  name: string;
  slug: string;
  position: number;
  status: ContentStatus;
  courseCount: number;
}

export interface AdminCourse {
  id: string;
  title: string;
  slug: string;
  status: ContentStatus;
  position: number;
  categoryId: string;
  categoryName: string;
  moduleCount: number;
  lessonCount: number;
  publishedAt: string | null;
}

export interface AdminLesson {
  id: string;
  title: string;
  position: number;
  videoId: string | null;
  videoProvider: string;
  durationSeconds: number | null;
  isPublished: boolean;
}

export interface AdminModule {
  id: string;
  title: string;
  position: number;
  lessons: AdminLesson[];
}

export interface AdminCourseDetail extends AdminCourse {
  description: string | null;
  coverUrl: string | null;
  modules: AdminModule[];
}

export interface AdminBook {
  id: string;
  title: string;
  slug: string;
  author: string | null;
  status: ContentStatus;
  position: number;
  pageCount: number;
  isDownloadable: boolean;
  filePath: string;
  publishedAt: string | null;
}

export interface AdminUser {
  id: string;
  email: string;
  createdAt: string;
  trialStartedAt: string | null;
  isAdmin: boolean;
  subscriptionStatus: SubscriptionStatus | null;
  deviceCount: number;
}

export interface AdminCommission {
  id: string;
  affiliateEmail: string;
  referredEmail: string;
  amountCents: number;
  status: CommissionStatus;
  createdAt: string;
}

export async function listCategoriesForAdmin(): Promise<AdminCategory[]> {
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase
    .from("categories")
    .select("id, name, slug, position, status, courses(id)")
    .order("position", { ascending: true })
    .returns<
      {
        id: string;
        name: string;
        slug: string;
        position: number;
        status: ContentStatus;
        courses: { id: string }[];
      }[]
    >();

  if (error) throw new Error(`admin-query-service: ${error.message}`);

  return (data ?? []).map((row) => ({
    id: row.id,
    name: row.name,
    slug: row.slug,
    position: row.position,
    status: row.status,
    courseCount: row.courses.length,
  }));
}

interface AdminCourseRow {
  id: string;
  title: string;
  slug: string;
  status: ContentStatus;
  position: number;
  published_at: string | null;
  category_id: string;
  description: string | null;
  cover_url: string | null;
  categories: { name: string } | null;
  modules: { id: string; title: string; position: number; lessons: { id: string }[] }[];
}

export async function listCoursesForAdmin(): Promise<AdminCourse[]> {
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase
    .from("courses")
    .select(
      "id, title, slug, status, position, published_at, category_id, description, cover_url, categories(name), modules(id, title, position, lessons(id))",
    )
    .order("position", { ascending: true })
    .returns<AdminCourseRow[]>();

  if (error) throw new Error(`admin-query-service: ${error.message}`);

  return (data ?? []).map(toAdminCourse);
}

export async function getCourseForAdmin(courseId: string): Promise<AdminCourseDetail | null> {
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase
    .from("courses")
    .select(
      "id, title, slug, status, position, published_at, category_id, description, cover_url, categories(name), modules(id, title, position, lessons(id, title, position, video_id, video_provider, duration_seconds, is_published))",
    )
    .eq("id", courseId)
    .maybeSingle()
    .returns<
      | (Omit<AdminCourseRow, "modules"> & {
          modules: {
            id: string;
            title: string;
            position: number;
            lessons: {
              id: string;
              title: string;
              position: number;
              video_id: string | null;
              video_provider: string;
              duration_seconds: number | null;
              is_published: boolean;
            }[];
          }[];
        })
      | null
    >();

  if (error) throw new Error(`admin-query-service: ${error.message}`);
  if (!data) return null;

  const modules: AdminModule[] = [...data.modules]
    .sort((a, b) => a.position - b.position)
    .map((module) => ({
      id: module.id,
      title: module.title,
      position: module.position,
      lessons: [...module.lessons]
        .sort((a, b) => a.position - b.position)
        .map((lesson) => ({
          id: lesson.id,
          title: lesson.title,
          position: lesson.position,
          videoId: lesson.video_id,
          videoProvider: lesson.video_provider,
          durationSeconds: lesson.duration_seconds,
          isPublished: lesson.is_published,
        })),
    }));

  return {
    ...toAdminCourse({ ...data, modules: data.modules.map((m) => ({ ...m, lessons: m.lessons })) }),
    description: data.description,
    coverUrl: data.cover_url,
    modules,
  };
}

export async function listBooksForAdmin(): Promise<AdminBook[]> {
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase
    .from("books")
    .select("id, title, slug, author, status, position, page_count, is_downloadable, file_path, published_at")
    .order("position", { ascending: true });

  if (error) throw new Error(`admin-query-service: ${error.message}`);

  return (data ?? []).map((row) => ({
    id: row.id,
    title: row.title,
    slug: row.slug,
    author: row.author,
    status: row.status,
    position: row.position,
    pageCount: row.page_count,
    isDownloadable: row.is_downloadable,
    filePath: row.file_path,
    publishedAt: row.published_at,
  }));
}

/**
 * Listado de usuarios para soporte. Usa `service_role` porque un administrador
 * necesita ver suscripciones y dispositivos de terceros, y las policies de esas
 * tablas solo permiten leer lo propio.
 */
export async function listUsersForAdmin(search?: string): Promise<AdminUser[]> {
  const supabase = createSupabaseAdminClient();

  let query = supabase
    .from("profiles")
    .select("id, email, created_at, trial_started_at, is_admin")
    .order("created_at", { ascending: false })
    .limit(200);

  if (search) query = query.ilike("email", `%${search}%`);

  const { data: profiles, error } = await query.returns<
    { id: string; email: string; created_at: string; trial_started_at: string | null; is_admin: boolean }[]
  >();

  if (error) throw new Error(`admin-query-service: ${error.message}`);
  const ids = (profiles ?? []).map((profile) => profile.id);
  if (ids.length === 0) return [];

  const [{ data: subscriptions }, { data: devices }] = await Promise.all([
    supabase
      .from("subscriptions")
      .select("user_id, status, created_at")
      .in("user_id", ids)
      .returns<{ user_id: string; status: SubscriptionStatus; created_at: string }[]>(),
    supabase
      .from("user_devices")
      .select("user_id, released_at")
      .in("user_id", ids)
      .is("released_at", null)
      .returns<{ user_id: string; released_at: string | null }[]>(),
  ]);

  const statusByUser = new Map<string, SubscriptionStatus>();
  for (const subscription of subscriptions ?? []) {
    if (!statusByUser.has(subscription.user_id)) statusByUser.set(subscription.user_id, subscription.status);
  }

  const devicesByUser = new Map<string, number>();
  for (const device of devices ?? []) {
    devicesByUser.set(device.user_id, (devicesByUser.get(device.user_id) ?? 0) + 1);
  }

  return (profiles ?? []).map((profile) => ({
    id: profile.id,
    email: profile.email,
    createdAt: profile.created_at,
    trialStartedAt: profile.trial_started_at,
    isAdmin: profile.is_admin,
    subscriptionStatus: statusByUser.get(profile.id) ?? null,
    deviceCount: devicesByUser.get(profile.id) ?? 0,
  }));
}

export async function listCommissionsForAdmin(): Promise<AdminCommission[]> {
  const supabase = createSupabaseAdminClient();

  const { data, error } = await supabase
    .from("commissions")
    .select("id, amount_cents, status, created_at, affiliate_user_id, referred_user_id")
    .order("created_at", { ascending: false })
    .limit(200)
    .returns<
      {
        id: string;
        amount_cents: number;
        status: CommissionStatus;
        created_at: string;
        affiliate_user_id: string;
        referred_user_id: string;
      }[]
    >();

  if (error) throw new Error(`admin-query-service: ${error.message}`);

  const ids = Array.from(
    new Set((data ?? []).flatMap((row) => [row.affiliate_user_id, row.referred_user_id])),
  );
  if (ids.length === 0) return [];

  const { data: profiles } = await supabase
    .from("profiles")
    .select("id, email")
    .in("id", ids)
    .returns<{ id: string; email: string }[]>();

  const emailById = new Map((profiles ?? []).map((profile) => [profile.id, profile.email]));

  return (data ?? []).map((row) => ({
    id: row.id,
    affiliateEmail: emailById.get(row.affiliate_user_id) ?? "—",
    referredEmail: emailById.get(row.referred_user_id) ?? "—",
    amountCents: row.amount_cents,
    status: row.status,
    createdAt: row.created_at,
  }));
}

export interface AdminSettings {
  key: string;
  value: number;
}

export async function listSettings(): Promise<AdminSettings[]> {
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase.from("app_settings").select("key, value").order("key");
  if (error) throw new Error(`admin-query-service: ${error.message}`);

  return (data ?? []).map((row) => ({
    key: row.key,
    value: typeof row.value === "number" ? row.value : Number(row.value ?? 0),
  }));
}

function toAdminCourse(row: AdminCourseRow): AdminCourse {
  return {
    id: row.id,
    title: row.title,
    slug: row.slug,
    status: row.status,
    position: row.position,
    categoryId: row.category_id,
    categoryName: row.categories?.name ?? "",
    moduleCount: row.modules.length,
    lessonCount: row.modules.reduce((acc, module) => acc + module.lessons.length, 0),
    publishedAt: row.published_at,
  };
}
