import type { MetadataRoute } from "next";

/**
 * Manifest para instalación como PWA ligera. Sin service worker por ahora;
 * el manifest permite que iOS/Android traten la app como una y que el
 * navegador muestre el nombre y colores correctos.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Cursalia",
    short_name: "Cursalia",
    description:
      "Formación en vídeo y biblioteca de lectura con una única suscripción.",
    start_url: "/",
    display: "standalone",
    background_color: "#0a0a0a",
    theme_color: "#0a0a0a",
    lang: "es",
    icons: [
      { src: "/favicon.ico", sizes: "any", type: "image/x-icon" },
    ],
  };
}
