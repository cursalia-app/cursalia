"use client";

import * as React from "react";

function subscribe(onStoreChange: () => void): () => void {
  const id = window.setInterval(onStoreChange, 500);
  return () => window.clearInterval(id);
}

/**
 * Segundo actual del reloj del cliente. En servidor devuelve `null`, de modo que
 * el HTML servido no contiene ninguna hora y no hay desajuste de hidratación.
 * El valor solo cambia al cambiar el segundo, así que no provoca renders en cascada.
 */
export function useEpochSeconds(): number | null {
  return React.useSyncExternalStore(
    subscribe,
    () => Math.floor(Date.now() / 1000),
    () => null,
  );
}

/**
 * Milisegundos que quedan hasta `endsAt`, o `null` mientras no hay reloj de cliente.
 * Es SOLO informativo: quien decide el acceso es el servidor (RN-14).
 */
export function useRemainingMs(endsAt: string | null): number | null {
  const seconds = useEpochSeconds();
  if (endsAt === null || seconds === null) return null;
  return Math.max(0, new Date(endsAt).getTime() - seconds * 1000);
}

/** 84 000 -> "01:24". Formato de cronómetro para la prueba gratuita. */
export function formatClock(ms: number): string {
  const total = Math.floor(ms / 1000);
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
}
