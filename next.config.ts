import path from "node:path";
import type { NextConfig } from "next";

/**
 * Extrae el host de una URL. Devuelve null si la variable no está definida o no
 * es una URL válida: la CSP incluye la fuente solo cuando corresponde.
 */
function hostOf(url: string | undefined): string | null {
  if (!url) return null;
  try {
    return new URL(url).host;
  } catch {
    return null;
  }
}

const supabaseHost = hostOf(process.env.NEXT_PUBLIC_SUPABASE_URL);
const streamHost = process.env.BUNNY_STREAM_CDN_HOSTNAME ?? null;
const storageHost = process.env.BUNNY_STORAGE_CDN_HOSTNAME ?? null;

// Fuentes que necesita el navegador para trabajar con el sitio.
const scriptSources = ["'self'", "'unsafe-inline'"];
const styleSources = ["'self'", "'unsafe-inline'"];
const imageSources = ["'self'", "data:", "blob:", "https://*.bunnycdn.com", "https://*.b-cdn.net"];
const mediaSources = ["'self'", "blob:", "https://*.bunnycdn.com", "https://*.b-cdn.net"];
const connectSources = ["'self'", "https://*.bunnycdn.com", "https://*.b-cdn.net"];
const workerSources = ["'self'", "blob:"];

if (supabaseHost) {
  connectSources.push(`https://${supabaseHost}`, `wss://${supabaseHost}`);
}
if (streamHost) {
  mediaSources.push(`https://${streamHost}`);
  connectSources.push(`https://${streamHost}`);
}
if (storageHost) {
  imageSources.push(`https://${storageHost}`);
  connectSources.push(`https://${storageHost}`);
}

const csp = [
  "default-src 'self'",
  `script-src ${scriptSources.join(" ")}`,
  `style-src ${styleSources.join(" ")}`,
  `img-src ${imageSources.join(" ")}`,
  `media-src ${mediaSources.join(" ")}`,
  `connect-src ${connectSources.join(" ")}`,
  `worker-src ${workerSources.join(" ")}`,
  "font-src 'self' data:",
  "frame-ancestors 'none'",
  "form-action 'self'",
  "base-uri 'self'",
  "object-src 'none'",
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains; preload" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), interest-cohort=(), browsing-topics=()",
  },
  // Poison X-DNS-Prefetch-Control: la app no necesita prefetch DNS del navegador,
  // y desactivarlo evita filtrar dominios a resolvers externos por rebote.
  { key: "X-DNS-Prefetch-Control", value: "off" },
];

const nextConfig: NextConfig = {
  // El proyecto vive dentro de Downloads: sin esto Turbopack sube hasta el home
  // buscando el lockfile y avisa en cada arranque.
  turbopack: { root: path.resolve(process.cwd()) },
  poweredByHeader: false,
  // Autoriza `next/image` a optimizar cualquier host de Bunny. Sin esto, en
  // producción `<Image src="https://...b-cdn.net/...">` sería rechazado.
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "**.bunnycdn.com" },
      { protocol: "https", hostname: "**.b-cdn.net" },
    ],
  },
  headers: async () => [
    {
      source: "/:path*",
      headers: securityHeaders,
    },
  ],
};

export default nextConfig;
