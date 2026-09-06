import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
const DESCRIPTION =
  "Formación en vídeo y biblioteca de lectura con una única suscripción. Todo el catálogo, sin comprar cursos sueltos.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: "Cursalia", template: "%s · Cursalia" },
  description: DESCRIPTION,
  applicationName: "Cursalia",
  keywords: ["cursos", "formación", "biblioteca", "vídeo", "aprender online"],
  authors: [{ name: "Cursalia" }],
  robots: { index: true, follow: true },
  openGraph: {
    type: "website",
    locale: "es_ES",
    url: SITE_URL,
    siteName: "Cursalia",
    title: "Cursalia",
    description: DESCRIPTION,
  },
  twitter: {
    card: "summary_large_image",
    title: "Cursalia",
    description: DESCRIPTION,
  },
  manifest: "/manifest.webmanifest",
};

export const viewport: Viewport = {
  themeColor: "#0a0a0a",
  colorScheme: "dark",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="min-h-full">{children}</body>
    </html>
  );
}
