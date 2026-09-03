"use client";

import * as React from "react";
import { AlertTriangle } from "lucide-react";
import Link from "next/link";

/**
 * Registra el aparato desde el que se está usando la cuenta (RN-08).
 *
 * La huella no identifica a una persona: solo distingue un navegador de otro,
 * combinando cosas que ya envía el propio navegador. No se guarda ninguna IP.
 * Si se alcanza el límite, se avisa con un mensaje claro, nunca con un error.
 */
export function DeviceRegistrar() {
  const [limitMessage, setLimitMessage] = React.useState<string | null>(null);

  React.useEffect(() => {
    const controller = new AbortController();

    void fingerprint().then((value) =>
      fetch("/api/devices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fingerprint: value }),
        signal: controller.signal,
      })
        .then(async (response) => {
          if (response.status !== 409) return;
          const payload = (await response.json()) as { message?: string };
          setLimitMessage(payload.message ?? "Has alcanzado el máximo de dispositivos.");
        })
        .catch(() => {
          // Un fallo al registrar el aparato no puede impedir estudiar.
        }),
    );

    return () => controller.abort();
  }, []);

  if (!limitMessage) return null;

  return (
    <div
      role="alert"
      className="fixed inset-x-4 bottom-20 z-40 mx-auto max-w-md rounded-[10px] border border-warn/30 bg-warn/10 p-4 lg:bottom-6 lg:left-auto lg:right-6"
    >
      <div className="flex gap-3">
        <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warn" strokeWidth={1.75} />
        <div className="space-y-2">
          <p className="text-[13px] leading-relaxed text-foreground">{limitMessage}</p>
          <Link
            href="/cuenta/dispositivos"
            className="inline-block text-[12px] text-warn underline underline-offset-4"
          >
            Ver mis dispositivos
          </Link>
        </div>
      </div>
    </div>
  );
}

/**
 * Huella estable del navegador. Se calcula con SHA-256 sobre rasgos que no
 * cambian entre sesiones y se guarda en el propio navegador para que no varíe
 * si el usuario cambia el tamaño de la ventana.
 */
async function fingerprint(): Promise<string> {
  const stored = readStored();
  if (stored) return stored;

  const traits = [
    navigator.userAgent,
    navigator.language,
    String(screen.width),
    String(screen.height),
    String(screen.colorDepth),
    String(new Date().getTimezoneOffset()),
    String(navigator.hardwareConcurrency ?? 0),
  ].join("|");

  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(traits));
  const value = Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");

  try {
    localStorage.setItem("cursalia:device", value);
  } catch {
    // Navegación privada o almacenamiento bloqueado: se recalcula cada vez.
  }

  return value;
}

function readStored(): string | null {
  try {
    const value = localStorage.getItem("cursalia:device");
    return value && value.length >= 8 ? value : null;
  } catch {
    return null;
  }
}
