"use client";

import * as React from "react";
import Link from "next/link";
import { Check, ChevronLeft, ChevronRight } from "lucide-react";
import { VideoPlayer } from "@/components/player/video-player";
import { Button } from "@/components/ui/button";
import { saveLessonPositionAction, setLessonCompletedAction } from "@/lib/actions/learner-actions";
import { cn } from "@/lib/utils";
import type { LessonContext } from "@/lib/types/domain";

interface SignedVideoResponse {
  url: string;
  expiresAt: string;
  watermark: string;
}

/**
 * Une el reproductor con las acciones del capítulo.
 *
 * La URL firmada NO viene incrustada en el HTML: se pide a `/api/video/[id]` al
 * montar, para que el servidor la emita atada a la IP de quien realmente está
 * viendo y con la caducidad recortada al fin del acceso.
 */
export function LessonPlayer({
  context,
  courseSlug,
  fallbackWatermark,
}: {
  context: LessonContext;
  courseSlug: string;
  fallbackWatermark: string;
}) {
  const [completed, setCompleted] = React.useState(Boolean(context.lesson.progress?.completedAt));
  const [video, setVideo] = React.useState<SignedVideoResponse | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const lessonId = context.lesson.id;

  /* Al cambiar de capítulo se descarta la URL anterior antes de pintar nada. */
  const [loadedFor, setLoadedFor] = React.useState(lessonId);
  if (loadedFor !== lessonId) {
    setLoadedFor(lessonId);
    setVideo(null);
    setError(null);
  }

  React.useEffect(() => {
    const controller = new AbortController();

    fetch(`/api/video/${lessonId}`, { signal: controller.signal, cache: "no-store" })
      .then(async (response) => {
        if (response.ok) return (await response.json()) as SignedVideoResponse;
        if (response.status === 403) throw new Error("Tu acceso ha terminado.");
        if (response.status === 404) throw new Error("Este capítulo todavía no tiene vídeo.");
        throw new Error("No se ha podido cargar el vídeo.");
      })
      .then(setVideo)
      .catch((cause: unknown) => {
        if (cause instanceof DOMException && cause.name === "AbortError") return;
        setError(cause instanceof Error ? cause.message : "No se ha podido cargar el vídeo.");
      });

    return () => controller.abort();
  }, [lessonId]);

  const handleSaveProgress = React.useCallback(
    (seconds: number) => {
      void saveLessonPositionAction(lessonId, seconds);
    },
    [lessonId],
  );

  const handleCompleted = React.useCallback(() => {
    // Al 90% se marca solo. El usuario puede desmarcarlo a mano.
    setCompleted(true);
    void setLessonCompletedAction(lessonId, true);
  }, [lessonId]);

  const toggleCompleted = () => {
    const next = !completed;
    setCompleted(next);
    void setLessonCompletedAction(lessonId, next);
  };

  return (
    <div className="space-y-4">
      <VideoPlayer
        src={video?.url ?? null}
        watermark={video?.watermark ?? fallbackWatermark}
        startAtSeconds={context.lesson.progress?.lastPositionSeconds ?? 0}
        durationHint={context.lesson.durationSeconds}
        onSaveProgress={handleSaveProgress}
        onCompleted={handleCompleted}
        notice={error}
      />

      <div className="space-y-1">
        <p className="text-[11px] uppercase tracking-wider text-subtle">{context.module.title}</p>
        <h1 className="text-xl font-semibold tracking-[-0.02em]">{context.lesson.title}</h1>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant={completed ? "secondary" : "outline"}
          size="sm"
          onClick={toggleCompleted}
          aria-pressed={completed}
        >
          <Check
            className={cn("size-3.5", completed ? "text-success" : "text-subtle")}
            strokeWidth={2.5}
          />
          {completed ? "Completado" : "Marcar completado"}
        </Button>

        <div className="ml-auto flex items-center gap-2">
          {context.previousLessonId ? (
            <Button asChild variant="ghost" size="sm">
              <Link href={`/cursos/${courseSlug}/${context.previousLessonId}`}>
                <ChevronLeft className="size-3.5" strokeWidth={1.75} />
                Anterior
              </Link>
            </Button>
          ) : null}
          {context.nextLessonId ? (
            <Button asChild variant="secondary" size="sm">
              <Link href={`/cursos/${courseSlug}/${context.nextLessonId}`}>
                Siguiente
                <ChevronRight className="size-3.5" strokeWidth={1.75} />
              </Link>
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
