"use client";

import * as React from "react";
import {
  Maximize,
  Minimize,
  Pause,
  Play,
  SkipBack,
  SkipForward,
  Volume2,
  VolumeX,
} from "lucide-react";
import { cn, formatTimecode } from "@/lib/utils";

const RATES = [1, 1.25, 1.5, 1.75, 2] as const;
/** Cada cuántos segundos se persiste la posición. */
const SAVE_EVERY_SECONDS = 10;
/** Umbral de completado automático. */
const COMPLETE_AT = 0.9;

export interface VideoPlayerProps {
  /**
   * URL firmada, emitida SOLO por el servidor tras comprobar el acceso (RN-07).
   * `null` mientras no hay fuente: el reproductor se dibuja pero no carga nada.
   */
  src: string | null;
  /** Correo del usuario. Se superpone como marca de agua. */
  watermark: string;
  startAtSeconds?: number;
  durationHint?: number;
  onSaveProgress?: (seconds: number) => void;
  onCompleted?: () => void;
  /** Qué contar sobre el vídeo cuando no hay fuente: un error, o que está en camino. */
  notice?: string | null;
}

/** Posiciones por las que rota la marca de agua para dificultar recortarla. */
const WATERMARK_SPOTS = [
  "top-6 left-6",
  "top-6 right-6",
  "bottom-20 right-6",
  "bottom-20 left-6",
] as const;

export function VideoPlayer({
  src,
  watermark,
  startAtSeconds = 0,
  durationHint = 0,
  onSaveProgress,
  onCompleted,
  notice,
}: VideoPlayerProps) {
  const containerRef = React.useRef<HTMLDivElement>(null);
  const videoRef = React.useRef<HTMLVideoElement>(null);
  const hideTimer = React.useRef<number | null>(null);
  const lastSaved = React.useRef(0);
  const completed = React.useRef(false);

  const [playing, setPlaying] = React.useState(false);
  const [current, setCurrent] = React.useState(startAtSeconds);
  const [duration, setDuration] = React.useState(durationHint);
  const [muted, setMuted] = React.useState(false);
  const [rate, setRate] = React.useState<number>(1);
  const [fullscreen, setFullscreen] = React.useState(false);
  const [controlsVisible, setControlsVisible] = React.useState(true);
  const [spot, setSpot] = React.useState(0);

  /* La marca de agua cambia de esquina cada minuto. */
  React.useEffect(() => {
    const id = window.setInterval(() => setSpot((s) => (s + 1) % WATERMARK_SPOTS.length), 60_000);
    return () => window.clearInterval(id);
  }, []);

  /* Carga de la fuente: HLS nativo en Safari, hls.js en el resto. */
  React.useEffect(() => {
    const video = videoRef.current;
    if (!video || !src) return;

    let destroy: (() => void) | undefined;
    const isHls = src.includes(".m3u8");

    if (!isHls || video.canPlayType("application/vnd.apple.mpegurl")) {
      video.src = src;
    } else {
      let cancelled = false;
      void import("hls.js").then(({ default: Hls }) => {
        if (cancelled || !Hls.isSupported()) return;
        const hls = new Hls({ maxBufferLength: 30 });
        hls.loadSource(src);
        hls.attachMedia(video);
        destroy = () => hls.destroy();
      });
      return () => {
        cancelled = true;
        destroy?.();
      };
    }

    return () => destroy?.();
  }, [src]);

  /* Retoma exactamente donde se dejó. */
  React.useEffect(() => {
    const video = videoRef.current;
    if (!video || startAtSeconds <= 0) return;
    const onLoaded = () => {
      video.currentTime = startAtSeconds;
    };
    video.addEventListener("loadedmetadata", onLoaded, { once: true });
    return () => video.removeEventListener("loadedmetadata", onLoaded);
  }, [startAtSeconds]);

  React.useEffect(() => {
    const onChange = () => setFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  const scheduleHide = React.useCallback(() => {
    if (hideTimer.current) window.clearTimeout(hideTimer.current);
    setControlsVisible(true);
    hideTimer.current = window.setTimeout(() => {
      if (!videoRef.current?.paused) setControlsVisible(false);
    }, 2500);
  }, []);

  const togglePlay = React.useCallback(() => {
    const video = videoRef.current;
    if (!video || !src) return;
    if (video.paused) void video.play();
    else video.pause();
  }, [src]);

  const seekBy = React.useCallback((delta: number) => {
    const video = videoRef.current;
    if (!video) return;
    video.currentTime = Math.max(0, Math.min(video.duration || 0, video.currentTime + delta));
  }, []);

  const onTimeUpdate = () => {
    const video = videoRef.current;
    if (!video) return;
    setCurrent(video.currentTime);

    if (video.currentTime - lastSaved.current >= SAVE_EVERY_SECONDS) {
      lastSaved.current = video.currentTime;
      onSaveProgress?.(Math.floor(video.currentTime));
    }
    if (!completed.current && video.duration > 0 && video.currentTime / video.duration >= COMPLETE_AT) {
      completed.current = true;
      onCompleted?.();
    }
  };

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === " " || event.key === "k") {
      event.preventDefault();
      togglePlay();
    } else if (event.key === "ArrowRight") {
      seekBy(10);
    } else if (event.key === "ArrowLeft") {
      seekBy(-10);
    } else if (event.key === "m") {
      setMuted((m) => !m);
    } else if (event.key === "f") {
      void toggleFullscreen();
    }
  };

  const toggleFullscreen = async () => {
    if (document.fullscreenElement) await document.exitFullscreen();
    else await containerRef.current?.requestFullscreen();
  };

  const cycleRate = () => {
    const next = RATES[(RATES.indexOf(rate as (typeof RATES)[number]) + 1) % RATES.length];
    setRate(next);
    if (videoRef.current) videoRef.current.playbackRate = next;
  };

  const progressRatio = duration > 0 ? current / duration : 0;

  const onScrub = (event: React.ChangeEvent<HTMLInputElement>) => {
    const value = Number(event.target.value);
    setCurrent(value);
    if (videoRef.current) videoRef.current.currentTime = value;
  };

  return (
    <div
      ref={containerRef}
      onMouseMove={scheduleHide}
      onKeyDown={onKeyDown}
      tabIndex={0}
      role="region"
      aria-label="Reproductor de vídeo"
      className="group relative aspect-video w-full overflow-hidden rounded-[10px] border border-line bg-black outline-none"
    >
      <video
        ref={videoRef}
        muted={muted}
        playsInline
        onClick={togglePlay}
        onPlay={() => {
          setPlaying(true);
          scheduleHide();
        }}
        onPause={() => {
          setPlaying(false);
          setControlsVisible(true);
        }}
        onTimeUpdate={onTimeUpdate}
        onLoadedMetadata={(e) => setDuration(e.currentTarget.duration || durationHint)}
        className="size-full object-contain"
      />

      {/* Marca de agua: disuasión, no protección. Va sobre el vídeo y rota de esquina. */}
      <span
        aria-hidden="true"
        className={cn(
          "num pointer-events-none absolute select-none text-[11px] text-white/[0.14] transition-all duration-700",
          WATERMARK_SPOTS[spot],
        )}
      >
        {watermark}
      </span>

      {!src ? (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-background/80 px-6 text-center">
          {notice ? (
            <>
              <p className="text-sm text-foreground">No se puede reproducir</p>
              <p className="max-w-sm text-xs leading-relaxed text-muted">{notice}</p>
            </>
          ) : (
            <p className="text-xs text-muted">Preparando el vídeo…</p>
          )}
        </div>
      ) : null}

      {!playing && src ? (
        <button
          type="button"
          onClick={togglePlay}
          aria-label="Reproducir"
          className="absolute inset-0 flex items-center justify-center bg-black/25 transition-colors hover:bg-black/35"
        >
          <span className="flex size-16 items-center justify-center rounded-full border border-white/25 bg-black/60 backdrop-blur">
            <Play className="size-6 translate-x-0.5 fill-white text-white" />
          </span>
        </button>
      ) : null}

      <div
        className={cn(
          "absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 to-transparent px-4 pb-3 pt-10 transition-opacity duration-200",
          controlsVisible ? "opacity-100" : "pointer-events-none opacity-0",
        )}
      >
        <input
          type="range"
          min={0}
          max={duration || 0}
          step={0.1}
          value={current}
          onChange={onScrub}
          aria-label="Posición del vídeo"
          className="h-1 w-full cursor-pointer appearance-none rounded-full bg-white/20 accent-white [&::-webkit-slider-thumb]:size-3 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white"
          style={{
            background: `linear-gradient(to right, #fafafa ${progressRatio * 100}%, rgba(255,255,255,0.2) ${progressRatio * 100}%)`,
          }}
        />

        <div className="mt-2 flex items-center gap-1 text-white">
          <button type="button" onClick={togglePlay} aria-label={playing ? "Pausar" : "Reproducir"} className="p-2">
            {playing ? <Pause className="size-4 fill-white" /> : <Play className="size-4 fill-white" />}
          </button>
          <button type="button" onClick={() => seekBy(-10)} aria-label="Retroceder 10 segundos" className="hidden p-2 sm:block">
            <SkipBack className="size-4" strokeWidth={1.75} />
          </button>
          <button type="button" onClick={() => seekBy(10)} aria-label="Avanzar 10 segundos" className="hidden p-2 sm:block">
            <SkipForward className="size-4" strokeWidth={1.75} />
          </button>
          <button type="button" onClick={() => setMuted((m) => !m)} aria-label={muted ? "Activar sonido" : "Silenciar"} className="p-2">
            {muted ? <VolumeX className="size-4" strokeWidth={1.75} /> : <Volume2 className="size-4" strokeWidth={1.75} />}
          </button>

          <span className="num ml-2 text-[11px] text-white/70">
            {formatTimecode(current)} / {formatTimecode(duration)}
          </span>

          <button
            type="button"
            onClick={cycleRate}
            aria-label="Velocidad de reproducción"
            className="num ml-auto rounded px-2 py-1 text-[11px] text-white/70 hover:text-white"
          >
            {rate}×
          </button>
          <button
            type="button"
            onClick={() => void toggleFullscreen()}
            aria-label={fullscreen ? "Salir de pantalla completa" : "Pantalla completa"}
            className="p-2"
          >
            {fullscreen ? <Minimize className="size-4" strokeWidth={1.75} /> : <Maximize className="size-4" strokeWidth={1.75} />}
          </button>
        </div>
      </div>
    </div>
  );
}
