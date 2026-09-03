import { createSupabaseServerClient } from "@/lib/supabase/server";
import { log } from "@/lib/services/audit-service";
import { getVideoDuration, getVideoStatus } from "@/lib/services/video-service";
import {
  slugify,
  type BookInput,
  type CategoryInput,
  type CourseInput,
  type CourseManifest,
  type LessonInput,
  type ModuleInput,
} from "@/lib/validation/content";
import type { ContentStatus } from "@/lib/types/domain";

/**
 * Gestión del catálogo desde el panel.
 *
 * Escribe con el cliente de servidor, no con `service_role`: quien manda es la
 * policy RLS de administrador. Si alguien sin permisos llega hasta aquí, la base
 * de datos lo rechaza, no un `if` de este archivo.
 *
 * Toda operación deja rastro en AuditLog (RN-13).
 */

export type ReorderEntity = "category" | "course" | "module" | "lesson" | "book";
export type StatusEntity = "category" | "course" | "book";

export interface SavedEntity {
  id: string;
}

export async function upsertCategory(input: CategoryInput, actorId: string): Promise<SavedEntity> {
  const supabase = await createSupabaseServerClient();
  const payload = {
    name: input.name,
    slug: input.slug ?? slugify(input.name),
    ...(input.position !== undefined ? { position: input.position } : {}),
  };

  const { data, error } = input.id
    ? await supabase.from("categories").update(payload).eq("id", input.id).select("id").single()
    : await supabase.from("categories").insert(payload).select("id").single();

  if (error) throw new Error(`admin-content-service: ${error.message}`);

  await log(actorId, input.id ? "update_category" : "create_category", "category", data.id, payload);
  return { id: data.id };
}

export async function upsertCourse(input: CourseInput, actorId: string): Promise<SavedEntity> {
  const supabase = await createSupabaseServerClient();
  const payload = {
    category_id: input.categoryId,
    title: input.title,
    slug: input.slug ?? slugify(input.title),
    description: input.description ?? null,
    cover_url: input.coverUrl ?? null,
    ...(input.position !== undefined ? { position: input.position } : {}),
  };

  const { data, error } = input.id
    ? await supabase.from("courses").update(payload).eq("id", input.id).select("id").single()
    : await supabase.from("courses").insert(payload).select("id").single();

  if (error) throw new Error(`admin-content-service: ${error.message}`);

  await log(actorId, input.id ? "update_course" : "create_course", "course", data.id, payload);
  return { id: data.id };
}

export async function upsertModule(input: ModuleInput, actorId: string): Promise<SavedEntity> {
  const supabase = await createSupabaseServerClient();
  const payload = {
    course_id: input.courseId,
    title: input.title,
    ...(input.position !== undefined ? { position: input.position } : {}),
  };

  const { data, error } = input.id
    ? await supabase.from("modules").update(payload).eq("id", input.id).select("id").single()
    : await supabase.from("modules").insert(payload).select("id").single();

  if (error) throw new Error(`admin-content-service: ${error.message}`);

  await log(actorId, input.id ? "update_module" : "create_module", "module", data.id, payload);
  return { id: data.id };
}

/**
 * Un capítulo guarda `video_provider` + `video_id`. Nunca un archivo.
 * Si viene un vídeo nuevo y no se sabe cuánto dura, se le pregunta al proveedor:
 * la duración es lo que permite calcular la del curso entero.
 */
export async function upsertLesson(input: LessonInput, actorId: string): Promise<SavedEntity> {
  const supabase = await createSupabaseServerClient();

  let durationSeconds = input.durationSeconds ?? null;
  if (durationSeconds === null && input.videoId) {
    durationSeconds = await getVideoDuration(input.videoId).catch(() => null);
  }

  const payload = {
    module_id: input.moduleId,
    title: input.title,
    video_provider: input.videoProvider,
    video_id: input.videoId ?? null,
    duration_seconds: durationSeconds,
    ...(input.isPublished !== undefined ? { is_published: input.isPublished } : {}),
    ...(input.position !== undefined ? { position: input.position } : {}),
  };

  const { data, error } = input.id
    ? await supabase.from("lessons").update(payload).eq("id", input.id).select("id").single()
    : await supabase.from("lessons").insert(payload).select("id").single();

  if (error) throw new Error(`admin-content-service: ${error.message}`);

  await log(actorId, input.id ? "update_lesson" : "create_lesson", "lesson", data.id, payload);
  return { id: data.id };
}

export async function upsertBook(input: BookInput, actorId: string): Promise<SavedEntity> {
  const supabase = await createSupabaseServerClient();
  const payload = {
    title: input.title,
    slug: input.slug ?? slugify(input.title),
    author: input.author ?? null,
    description: input.description ?? null,
    cover_url: input.coverUrl ?? null,
    file_provider: input.fileProvider,
    file_path: input.filePath,
    page_count: input.pageCount,
    ...(input.isDownloadable !== undefined ? { is_downloadable: input.isDownloadable } : {}),
    ...(input.position !== undefined ? { position: input.position } : {}),
  };

  const { data, error } = input.id
    ? await supabase.from("books").update(payload).eq("id", input.id).select("id").single()
    : await supabase.from("books").insert(payload).select("id").single();

  if (error) throw new Error(`admin-content-service: ${error.message}`);

  await log(actorId, input.id ? "update_book" : "create_book", "book", data.id, payload);
  return { id: data.id };
}

/**
 * Reordena arrastrando. La reasignación de `position` ocurre dentro de una
 * transacción en la base de datos: no puede quedarse a medias.
 */
export async function reorder(entity: ReorderEntity, orderedIds: string[]): Promise<void> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("reorder_entity", { entity, ordered_ids: orderedIds });
  if (error) throw new Error(`admin-content-service: ${error.message}`);
}

/** Cambia el estado. `published_at` se graba solo en la primera publicación. */
export async function changeStatus(
  entity: StatusEntity,
  id: string,
  status: ContentStatus,
): Promise<void> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("set_content_status", {
    entity,
    target_id: id,
    new_status: status,
  });
  if (error) throw new Error(`admin-content-service: ${error.message}`);
}

export interface ImportResult {
  courseId: string;
  modules: number;
  lessons: number;
}

/**
 * Importación masiva de un curso completo a partir de un manifiesto.
 * Es la vía para traer las carpetas que hoy viven en Drive: el guion de ingesta
 * sube los vídeos a Bunny y produce este manifiesto; aquí se convierte en un
 * curso con sus temas y capítulos, en borrador y listo para revisar.
 */
export async function importCourseStructure(
  manifest: CourseManifest,
  actorId: string,
): Promise<ImportResult> {
  const course = await upsertCourse(
    {
      categoryId: manifest.categoryId,
      title: manifest.title,
      slug: manifest.slug ?? slugify(manifest.title),
      description: manifest.description ?? null,
    },
    actorId,
  );

  let lessonCount = 0;

  for (const [moduleIndex, module] of manifest.modules.entries()) {
    const saved = await upsertModule(
      { courseId: course.id, title: module.title, position: moduleIndex },
      actorId,
    );

    for (const [lessonIndex, lesson] of module.lessons.entries()) {
      await upsertLesson(
        {
          moduleId: saved.id,
          title: lesson.title,
          videoProvider: "bunny",
          videoId: lesson.videoId ?? null,
          durationSeconds: lesson.durationSeconds ?? null,
          position: lessonIndex,
          // Nada se publica solo: el curso entra en borrador y se revisa.
          isPublished: false,
        },
        actorId,
      );
      lessonCount++;
    }
  }

  await log(actorId, "import_course", "course", course.id, {
    modules: manifest.modules.length,
    lessons: lessonCount,
  });

  return { courseId: course.id, modules: manifest.modules.length, lessons: lessonCount };
}

/**
 * Estado de codificación de los capítulos de un curso. El panel lo usa para
 * impedir que se publique algo que Bunny todavía está procesando.
 */
export async function getLessonEncodingStates(
  courseId: string,
): Promise<{ lessonId: string; title: string; status: string }[]> {
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase
    .from("lessons")
    .select("id, title, video_id, modules!inner(course_id)")
    .eq("modules.course_id", courseId)
    .returns<{ id: string; title: string; video_id: string | null }[]>();

  if (error) throw new Error(`admin-content-service: ${error.message}`);

  return Promise.all(
    (data ?? []).map(async (lesson) => ({
      lessonId: lesson.id,
      title: lesson.title,
      status: lesson.video_id
        ? await getVideoStatus(lesson.video_id).catch(() => "error")
        : "sin_video",
    })),
  );
}

export type DeletableEntity = "category" | "course" | "module" | "lesson" | "book";

const TABLE_BY_ENTITY: Record<DeletableEntity, "categories" | "courses" | "modules" | "lessons" | "books"> = {
  category: "categories",
  course: "courses",
  module: "modules",
  lesson: "lessons",
  book: "books",
};

/**
 * Borrado real, reservado a contenido que nunca llegó a publicarse.
 * Para retirar algo que ya vieron alumnos se usa `archived`: así quien lo empezó
 * lo conserva (RN-06). Un tema o un capítulo arrastran a sus hijos en cascada.
 */
export async function deleteContent(
  entity: DeletableEntity,
  id: string,
  actorId: string,
): Promise<void> {
  const supabase = await createSupabaseServerClient();

  const { error } = await supabase.from(TABLE_BY_ENTITY[entity]).delete().eq("id", id);
  if (error) throw new Error(`admin-content-service: ${error.message}`);

  await log(actorId, "delete", entity, id, null);
}

/** Marca una comisión como aprobada, pagada o rechazada. El importe no se toca. */
export async function updateCommissionStatus(
  commissionId: string,
  status: "pending" | "approved" | "paid" | "rejected",
  actorId: string,
): Promise<void> {
  const supabase = await createSupabaseServerClient();

  const { error } = await supabase.from("commissions").update({ status }).eq("id", commissionId);
  if (error) throw new Error(`admin-content-service: ${error.message}`);

  await log(actorId, "update_commission_status", "commission", commissionId, { status });
}
