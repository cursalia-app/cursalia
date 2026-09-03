"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireCurrentUserId } from "@/lib/supabase/server";
import {
  saveBookPage,
  saveLessonPosition,
  setLessonCompleted,
} from "@/lib/services/progress-service";
import { ReleaseCooldownError, releaseDevice } from "@/lib/services/device-service";
import { activateAffiliate, SubscriptionRequiredError } from "@/lib/services/affiliate-service";

/**
 * Acciones del alumno. Todas parten del usuario de la sesión: el identificador
 * jamás llega desde el cliente, para que nadie pueda escribir progreso ajeno.
 */

const uuid = z.string().uuid();

export async function saveLessonPositionAction(lessonId: string, seconds: number): Promise<void> {
  const parsed = z.object({ lessonId: uuid, seconds: z.number().min(0) }).safeParse({
    lessonId,
    seconds,
  });
  if (!parsed.success) return;

  const userId = await requireCurrentUserId();
  await saveLessonPosition(userId, parsed.data.lessonId, parsed.data.seconds);
}

export async function setLessonCompletedAction(
  lessonId: string,
  completed: boolean,
): Promise<void> {
  const parsed = uuid.safeParse(lessonId);
  if (!parsed.success) return;

  const userId = await requireCurrentUserId();
  await setLessonCompleted(userId, parsed.data, completed);
  revalidatePath("/");
}

export async function saveBookPageAction(bookId: string, page: number): Promise<void> {
  const parsed = z.object({ bookId: uuid, page: z.number().int().min(1) }).safeParse({
    bookId,
    page,
  });
  if (!parsed.success) return;

  const userId = await requireCurrentUserId();
  await saveBookPage(userId, parsed.data.bookId, parsed.data.page);
}

export interface ActionResult {
  ok: boolean;
  message?: string;
}

export async function releaseDeviceAction(deviceId: string): Promise<ActionResult> {
  const parsed = uuid.safeParse(deviceId);
  if (!parsed.success) return { ok: false, message: "Dispositivo no válido" };

  const userId = await requireCurrentUserId();

  try {
    await releaseDevice(userId, parsed.data);
    revalidatePath("/cuenta/dispositivos");
    return { ok: true };
  } catch (error) {
    if (error instanceof ReleaseCooldownError) {
      const date = new Date(error.availableAt).toLocaleDateString("es-ES", {
        day: "numeric",
        month: "long",
      });
      return { ok: false, message: `Ya liberaste un dispositivo hace poco. Podrás repetir el ${date}.` };
    }
    throw error;
  }
}

export async function activateAffiliateAction(): Promise<ActionResult> {
  const userId = await requireCurrentUserId();

  try {
    await activateAffiliate(userId);
    revalidatePath("/afiliados");
    return { ok: true };
  } catch (error) {
    if (error instanceof SubscriptionRequiredError) {
      return {
        ok: false,
        message: "La sección de afiliados solo está disponible con la suscripción activa.",
      };
    }
    throw error;
  }
}
