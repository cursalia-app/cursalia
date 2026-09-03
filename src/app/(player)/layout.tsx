/**
 * Zona de consumo: reproductor y visor.
 * Sin barra lateral ni pestañas — aquí el contenido ocupa toda la pantalla.
 */
export default function PlayerLayout({ children }: { children: React.ReactNode }) {
  return <div className="min-h-dvh bg-background">{children}</div>;
}
