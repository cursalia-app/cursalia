import { z } from "zod";

/**
 * Esquemas de validación del contenido. Todo lo que entra por el panel o por un
 * endpoint pasa por aquí antes de llegar a un servicio.
 */

export const contentStatusSchema = z.enum(["draft", "published", "archived"]);

/** "Fundamentos de IA generativa" -> "fundamentos-de-ia-generativa" */
export function slugify(value: string): string {
  return value
    .normalize("NFD")
    // Marcas diacríticas combinantes: "Programación" -> "Programacion".
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

const slugSchema = z
  .string()
  .min(1)
  .max(80)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "El identificador solo admite minúsculas, números y guiones");

export const categoryInputSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().min(1).max(120),
  slug: slugSchema.optional(),
  position: z.number().int().min(0).optional(),
});

export const courseInputSchema = z.object({
  id: z.string().uuid().optional(),
  categoryId: z.string().uuid(),
  title: z.string().min(1).max(200),
  slug: slugSchema.optional(),
  description: z.string().max(2000).nullable().optional(),
  coverUrl: z.string().url().nullable().optional(),
  position: z.number().int().min(0).optional(),
});

export const moduleInputSchema = z.object({
  id: z.string().uuid().optional(),
  courseId: z.string().uuid(),
  title: z.string().min(1).max(200),
  position: z.number().int().min(0).optional(),
});

export const lessonInputSchema = z.object({
  id: z.string().uuid().optional(),
  moduleId: z.string().uuid(),
  title: z.string().min(1).max(200),
  videoProvider: z.string().min(1).default("bunny"),
  videoId: z.string().min(1).nullable().optional(),
  durationSeconds: z.number().int().min(0).nullable().optional(),
  isPublished: z.boolean().optional(),
  position: z.number().int().min(0).optional(),
});

export const bookInputSchema = z.object({
  id: z.string().uuid().optional(),
  title: z.string().min(1).max(200),
  slug: slugSchema.optional(),
  author: z.string().max(160).nullable().optional(),
  description: z.string().max(2000).nullable().optional(),
  coverUrl: z.string().url().nullable().optional(),
  fileProvider: z.string().min(1).default("bunny_storage"),
  filePath: z.string().min(1),
  pageCount: z.number().int().positive(),
  isDownloadable: z.boolean().optional(),
  position: z.number().int().min(0).optional(),
});

export const reorderSchema = z.object({
  entity: z.enum(["category", "course", "module", "lesson", "book"]),
  orderedIds: z.array(z.string().uuid()).min(1),
});

export const changeStatusSchema = z.object({
  entity: z.enum(["category", "course", "book"]),
  id: z.string().uuid(),
  status: contentStatusSchema,
});

/**
 * Manifiesto de importación masiva. Es la forma que produce el guion de
 * `scripts/drive-to-bunny`: una carpeta de Drive se convierte en un curso con
 * sus temas y capítulos, ya subidos a Bunny.
 */
export const courseManifestSchema = z.object({
  categoryId: z.string().uuid(),
  title: z.string().min(1).max(200),
  slug: slugSchema.optional(),
  description: z.string().max(2000).optional(),
  modules: z
    .array(
      z.object({
        title: z.string().min(1).max(200),
        lessons: z
          .array(
            z.object({
              title: z.string().min(1).max(200),
              videoId: z.string().min(1).nullable().optional(),
              durationSeconds: z.number().int().min(0).nullable().optional(),
            }),
          )
          .min(1),
      }),
    )
    .min(1),
});

export type CategoryInput = z.infer<typeof categoryInputSchema>;
export type CourseInput = z.infer<typeof courseInputSchema>;
export type ModuleInput = z.infer<typeof moduleInputSchema>;
export type LessonInput = z.infer<typeof lessonInputSchema>;
export type BookInput = z.infer<typeof bookInputSchema>;
export type CourseManifest = z.infer<typeof courseManifestSchema>;
