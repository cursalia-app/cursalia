"use client";

import * as React from "react";

/**
 * Estado local que se vuelve a alinear con el servidor cuando este cambia.
 *
 * Los editores del panel llevan una copia local de los datos para que arrastrar
 * o escribir se vea al instante, sin esperar al servidor. Cuando la acción
 * termina y `router.refresh()` trae datos nuevos, esa copia tiene que ceder.
 *
 * El ajuste se hace DURANTE el render, no en un efecto: así React descarta el
 * render obsoleto antes de pintarlo, en vez de pintar el valor viejo y provocar
 * un segundo render en cascada.
 * Ver https://react.dev/reference/react/useState#storing-information-from-previous-renders
 */
export function useServerState<T>(source: T): [T, React.Dispatch<React.SetStateAction<T>>] {
  const [value, setValue] = React.useState(source);
  const [lastSource, setLastSource] = React.useState(source);

  if (source !== lastSource) {
    setLastSource(source);
    setValue(source);
  }

  return [value, setValue];
}
