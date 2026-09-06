"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireCurrentUserId } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import {
  changeStatus,
  deleteContent,
  importCourseStructure,
  reorder,
  upsertBook,
  upsertCategory,
  upsertCourse,
  upsertLesson,
  upsertModule,
  updateCommissionStatus,
} from "@/lib/services/admin-content-service";
import { createVideo } from "@/lib/services/video-service";
import { generateCommissionForPayment } from "@/lib/services/affiliate-service";
import { setSetting, type SettingKey } from "@/lib/services/settings-service";
import {
  bookInputSchema,
  categoryInputSchema,
  changeStatusSchema,
  courseInputSchema,
  courseManifestSchema,
  lessonInputSchema,
  moduleInputSchema,
  reorderSchema,
} from "@/lib/validation/content";

/**
 * Acciones del panel de administración.
 *
 * Aquí no hay ninguna comprobación de rol: la imponen el middleware y, sobre
 * todo, las policies RLS. Si alguien sin permisos llegase a invocar una de estas
 * acciones, la base de datos rechazaría la escritura.
 */

export interface AdminResult {
  ok: boolean;
  id?: string;
  message?: string;
}

async function run(operation: () => Promise<{ id: string }>, paths: string[]): Promise<AdminResult> {
  try {
    const result = await operation();
    for (const path of paths) revalidatePath(path);
    return { ok: true, id: result.id };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "Error inesperado" };
  }
}

export async function saveCategoryAction(input: unknown): Promise<AdminResult> {
  const parsed = categoryInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message };

  const actorId = await requireCurrentUserId();
  return run(() => upsertCategory(parsed.data, actorId), ["/admin/categorias", "/cursos"]);
}

export async function saveCourseAction(input: unknown): Promise<AdminResult> {
  const parsed = courseInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message };

  const actorId = await requireCurrentUserId();
  return run(() => upsertCourse(parsed.data, actorId), ["/admin/cursos", "/cursos"]);
}

export async function saveModuleAction(input: unknown): Promise<AdminResult> {
  const parsed = moduleInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message };

  const actorId = await requireCurrentUserId();
  return run(() => upsertModule(parsed.data, actorId), ["/admin/cursos"]);
}

export async function saveLessonAction(input: unknown): Promise<AdminResult> {
  const parsed = lessonInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message };

  const actorId = await requireCurrentUserId();
  return run(() => upsertLesson(parsed.data, actorId), ["/admin/cursos"]);
}

export async function saveBookAction(input: unknown): Promise<AdminResult> {
  const parsed = bookInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message };

  const actorId = await requireCurrentUserId();
  return run(() => upsertBook(parsed.data, actorId), ["/admin/libros", "/libros"]);
}

export async function reorderAction(input: unknown): Promise<AdminResult> {
  const parsed = reorderSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message };

  try {
    await reorder(parsed.data.entity, parsed.data.orderedIds);
    revalidatePath("/admin");
    revalidatePath("/cursos");
    return { ok: true };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "Error inesperado" };
  }
}

export async function changeStatusAction(input: unknown): Promise<AdminResult> {
  const parsed = changeStatusSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message };

  try {
    await changeStatus(parsed.data.entity, parsed.data.id, parsed.data.status);
    revalidatePath("/admin");
    revalidatePath("/cursos");
    revalidatePath("/libros");
    return { ok: true };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "Error inesperado" };
  }
}

/** Da de alta el vídeo en Bunny y devuelve el identificador para subir el archivo. */
export async function createVideoAction(title: string): Promise<AdminResult> {
  const parsed = z.string().min(1).max(200).safeParse(title);
  if (!parsed.success) return { ok: false, message: "Título no válido" };

  try {
    const { videoId } = await createVideo(parsed.data);
    return { ok: true, id: videoId };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "Error inesperado" };
  }
}

/**
 * Importa un curso completo desde un manifiesto. Es la vía para traer de golpe
 * las carpetas que hoy están en Drive, una vez subidos los vídeos a Bunny.
 */
export async function importCourseAction(input: unknown): Promise<AdminResult> {
  const parsed = courseManifestSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message };

  const actorId = await requireCurrentUserId();

  try {
    const result = await importCourseStructure(parsed.data, actorId);
    revalidatePath("/admin/cursos");
    return {
      ok: true,
      id: result.courseId,
      message: `Importados ${result.modules} temas y ${result.lessons} capítulos, en borrador.`,
    };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "Error inesperado" };
  }
}

const settingSchema = z.object({
  key: z.enum([
    "trial_duration_minutes",
    "max_devices",
    "entry_commission_cents",
    "grace_period_days",
    "device_release_cooldown_days",
    "subscription_price_cents",
  ]),
  value: z.number().int().min(0),
});

export async function saveSettingAction(input: unknown): Promise<AdminResult> {
  const parsed = settingSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message };

  const actorId = await requireCurrentUserId();

  try {
    await setSetting(parsed.data.key as SettingKey, parsed.data.value, actorId);
    revalidatePath("/admin/ajustes");
    return { ok: true };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "Error inesperado" };
  }
}

const deleteSchema = z.object({
  entity: z.enum(["category", "course", "module", "lesson", "book"]),
  id: z.string().uuid(),
});

export async function deleteContentAction(input: unknown): Promise<AdminResult> {
  const parsed = deleteSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message };

  const actorId = await requireCurrentUserId();

  try {
    await deleteContent(parsed.data.entity, parsed.data.id, actorId);
    revalidatePath("/admin");
    revalidatePath("/cursos");
    revalidatePath("/libros");
    return { ok: true };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "Error inesperado" };
  }
}

const commissionSchema = z.object({
  id: z.string().uuid(),
  status: z.enum(["pending", "approved", "paid", "rejected"]),
});

export async function updateCommissionStatusAction(input: unknown): Promise<AdminResult> {
  const parsed = commissionSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message };

  const actorId = await requireCurrentUserId();

  try {
    await updateCommissionStatus(parsed.data.id, parsed.data.status, actorId);
    revalidatePath("/admin/comisiones");
    return { ok: true };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "Error inesperado" };
  }
}

/* --- Cobro manual: extender y revocar accesos -------------------------- */

const extendAccessSchema = z.object({
  userId: z.string().uuid(),
  months: z.number().int().min(1).max(24).default(1),
  amountCents: z.number().int().min(0).max(10_000_00).nullish(),
  note: z.string().trim().max(500).nullish(),
});

const revokeAccessSchema = z.object({
  userId: z.string().uuid(),
  reason: z.string().trim().max(500).nullish(),
});

/**
 * Extiende el acceso del usuario `months` meses. Si el admin declara un
 * importe, la RPC crea el pago; aquí generamos la comisión de afiliado
 * (si aplica) por el mismo camino que un pago automático.
 */
export async function extendAccessAction(input: unknown): Promise<AdminResult> {
  const parsed = extendAccessSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message };

  try {
    const supabase = createSupabaseAdminClient();
    const { data, error } = await supabase.rpc("admin_extend_access", {
      target_user_id: parsed.data.userId,
      months: parsed.data.months,
      amount_cents: parsed.data.amountCents ?? null,
      note: parsed.data.note ?? null,
    });
    if (error) return { ok: false, message: error.message };

    const payload = (data ?? {}) as { payment_id?: string | null };
    if (payload.payment_id) {
      // La misma regla que en el webhook: si el usuario tiene referrer y no
      // había comisión ya, se genera. Idempotente.
      await generateCommissionForPayment(payload.payment_id).catch(() => {});
    }

    revalidatePath("/admin");
    revalidatePath("/admin/usuarios");
    return { ok: true };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "Error inesperado" };
  }
}

const toggleAdminSchema = z.object({
  userId: z.string().uuid(),
  makeAdmin: z.boolean(),
});

const deleteUserSchema = z.object({
  userId: z.string().uuid(),
  reason: z.string().trim().max(500).nullish(),
});

/** Promueve o degrada el rol de administrador de un usuario. */
export async function toggleAdminAction(input: unknown): Promise<AdminResult> {
  const parsed = toggleAdminSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message };

  try {
    const supabase = createSupabaseAdminClient();
    const { error } = await supabase.rpc("admin_toggle_admin", {
      target_user_id: parsed.data.userId,
      make_admin: parsed.data.makeAdmin,
    });
    if (error) return { ok: false, message: error.message };

    revalidatePath("/admin/usuarios");
    return { ok: true };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "Error inesperado" };
  }
}

/**
 * Baja RGPD: anonimiza el email, corta la suscripción y libera dispositivos.
 * Auth.users NO se borra (perderíamos los pagos por cascade); su email se
 * actualiza también al valor anónimo desde la Admin API. La cuenta queda
 * inservible pero la traza contable se conserva.
 */
export async function deleteUserAction(input: unknown): Promise<AdminResult> {
  const parsed = deleteUserSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message };

  try {
    const supabase = createSupabaseAdminClient();
    const { data, error } = await supabase.rpc("admin_soft_delete_user", {
      target_user_id: parsed.data.userId,
      reason: parsed.data.reason ?? null,
    });
    if (error) return { ok: false, message: error.message };

    const anonEmail = (data as { anon_email?: string })?.anon_email;
    if (anonEmail) {
      // Actualiza también auth.users. Si falla, la parte pública ya está
      // anonimizada; el admin puede reintentar sin efectos raros.
      await supabase.auth.admin
        .updateUserById(parsed.data.userId, {
          email: anonEmail,
          password: crypto.randomUUID(),
        })
        .catch(() => {});
    }

    revalidatePath("/admin/usuarios");
    return { ok: true };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "Error inesperado" };
  }
}

/** Corta el acceso al instante. Las URLs firmadas ya emitidas caducan solas. */
export async function revokeAccessAction(input: unknown): Promise<AdminResult> {
  const parsed = revokeAccessSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message };

  try {
    const supabase = createSupabaseAdminClient();
    const { error } = await supabase.rpc("admin_revoke_access", {
      target_user_id: parsed.data.userId,
      reason: parsed.data.reason ?? null,
    });
    if (error) return { ok: false, message: error.message };

    revalidatePath("/admin");
    revalidatePath("/admin/usuarios");
    return { ok: true };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "Error inesperado" };
  }
}
