import type { MetadataRoute } from "next";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

/**
 * Bloqueamos la parte autenticada y el panel: nada de eso debe indexarse.
 * El catálogo público (/, /cursos, /libros) sí es rastreable, aunque una
 * página con RLS que exige sesión no filtrará contenido a los bots.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/admin/", "/api/", "/cuenta/", "/verificar/", "/recuperar/"],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
