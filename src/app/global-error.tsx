"use client";

import { useEffect } from "react";

/**
 * Último recurso: se dispara si el propio root layout falla y el error
 * boundary de aplicación no puede montarse. Debe renderizar HTML mínimo,
 * incluyendo `<html>` y `<body>`.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[global:error]", error);
  }, [error]);

  return (
    <html lang="es">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#0a0a0a",
          color: "#f5f5f5",
          fontFamily: "system-ui, -apple-system, sans-serif",
          padding: "1rem",
          textAlign: "center",
        }}
      >
        <div style={{ maxWidth: 420 }}>
          <p style={{ fontSize: 12, letterSpacing: "0.08em", textTransform: "uppercase", color: "#8a8a8a" }}>
            Error
          </p>
          <h1 style={{ fontSize: 22, margin: "8px 0 12px", fontWeight: 600 }}>
            Cursalia no puede cargar
          </h1>
          <p style={{ fontSize: 14, color: "#c0c0c0", margin: 0 }}>
            Ha ocurrido un fallo grave. Prueba a recargar; si persiste, escríbenos a{" "}
            <a style={{ color: "#f5f5f5" }} href="mailto:soporte@cursalia.com">
              soporte@cursalia.com
            </a>
            .
          </p>
          <button
            onClick={() => reset()}
            style={{
              marginTop: 20,
              padding: "8px 16px",
              borderRadius: 10,
              border: "1px solid #333",
              background: "#f5f5f5",
              color: "#0a0a0a",
              cursor: "pointer",
              fontSize: 14,
            }}
          >
            Recargar
          </button>
        </div>
      </body>
    </html>
  );
}
