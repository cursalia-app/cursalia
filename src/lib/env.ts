import { z } from "zod";

/**
 * Variables de entorno. Nada de secretos escritos en el código.
 * Las de servidor se leen de forma perezosa: así el navegador nunca las toca y
 * un despliegue sin configurar falla en el arranque del servidor, no en producción
 * a mitad de una petición.
 */

const publicSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
  NEXT_PUBLIC_SITE_URL: z.string().url(),
});

const serverSchema = z.object({
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  BUNNY_STREAM_LIBRARY_ID: z.string().min(1),
  BUNNY_STREAM_API_KEY: z.string().min(1),
  BUNNY_STREAM_CDN_HOSTNAME: z.string().min(1),
  BUNNY_STREAM_TOKEN_KEY: z.string().min(1),
  BUNNY_STORAGE_ZONE: z.string().min(1),
  BUNNY_STORAGE_API_KEY: z.string().min(1),
  BUNNY_STORAGE_CDN_HOSTNAME: z.string().min(1),
  BUNNY_STORAGE_TOKEN_KEY: z.string().min(1),
  PAYMENTS_WEBHOOK_SECRET: z.string().min(1),
});

export type PublicEnv = z.infer<typeof publicSchema>;
export type ServerEnv = z.infer<typeof serverSchema>;

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

let cachedServerEnv: ServerEnv | null = null;

export function getServerEnv(): ServerEnv {
  if (typeof window !== "undefined") {
    throw new Error("getServerEnv se ha llamado desde el navegador");
  }
  if (!cachedServerEnv) {
    cachedServerEnv = serverSchema.parse(process.env);
  }
  return cachedServerEnv;
}
