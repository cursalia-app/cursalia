import { z } from "zod";

/**
 * Variables de entorno. Nada de secretos escritos en el código.
 *
 * Se validan POR GRUPOS y solo cuando hacen falta. Así se puede levantar la
 * plataforma con Supabase configurado y nada más: el catálogo, el panel y el
 * progreso funcionan, y solo al pedir un vídeo o un libro se avisa de que falta
 * configurar Bunny. Exigirlo todo de golpe convertiría cualquier hueco en una
 * pantalla en blanco sin explicación.
 */

const publicSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
  NEXT_PUBLIC_SITE_URL: z.string().url(),
});

const supabaseAdminSchema = z.object({
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
});

const bunnyStreamSchema = z.object({
  BUNNY_STREAM_LIBRARY_ID: z.string().min(1),
  BUNNY_STREAM_API_KEY: z.string().min(1),
  BUNNY_STREAM_CDN_HOSTNAME: z.string().min(1),
  BUNNY_STREAM_TOKEN_KEY: z.string().min(1),
});

const bunnyStorageSchema = z.object({
  BUNNY_STORAGE_ZONE: z.string().min(1),
  BUNNY_STORAGE_API_KEY: z.string().min(1),
  BUNNY_STORAGE_CDN_HOSTNAME: z.string().min(1),
  BUNNY_STORAGE_TOKEN_KEY: z.string().min(1),
});

const paymentsSchema = z.object({
  PAYMENTS_WEBHOOK_SECRET: z.string().min(1),
});

export type PublicEnv = z.infer<typeof publicSchema>;
export type SupabaseAdminEnv = z.infer<typeof supabaseAdminSchema>;
export type BunnyStreamEnv = z.infer<typeof bunnyStreamSchema>;
export type BunnyStorageEnv = z.infer<typeof bunnyStorageSchema>;
export type PaymentsEnv = z.infer<typeof paymentsSchema>;

/** Falta configuración. Se distingue de un fallo real para poder contarlo bien. */
export class MissingConfigError extends Error {
  constructor(
    readonly area: string,
    readonly keys: string[],
  ) {
    super(`Falta configurar ${area}: ${keys.join(", ")}`);
    this.name = "MissingConfigError";
  }
}

/**
 * Next sustituye `process.env.NEXT_PUBLIC_*` en tiempo de compilación solo cuando
 * se accede de forma literal, así que estas referencias no pueden acortarse.
 */
export function getPublicEnv(): PublicEnv {
  return publicSchema.parse({
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000",
  });
}

const cache = new Map<string, unknown>();

function readGroup<T>(area: string, schema: z.ZodType<T>): T {
  if (typeof window !== "undefined") {
    throw new Error(`La configuración de ${area} no puede leerse desde el navegador`);
  }

  const cached = cache.get(area);
  if (cached) return cached as T;

  const result = schema.safeParse(process.env);
  if (!result.success) {
    throw new MissingConfigError(
      area,
      result.error.issues.map((issue) => String(issue.path[0])),
    );
  }

  cache.set(area, result.data);
  return result.data;
}

export function getSupabaseAdminEnv(): SupabaseAdminEnv {
  return readGroup("Supabase", supabaseAdminSchema);
}

export function getBunnyStreamEnv(): BunnyStreamEnv {
  return readGroup("Bunny Stream", bunnyStreamSchema);
}

export function getBunnyStorageEnv(): BunnyStorageEnv {
  return readGroup("Bunny Storage", bunnyStorageSchema);
}

export function getPaymentsEnv(): PaymentsEnv {
  return readGroup("la pasarela de pagos", paymentsSchema);
}

/** Solo para los tests: la caché vive en memoria del proceso. */
export function clearEnvCache(): void {
  cache.clear();
}
