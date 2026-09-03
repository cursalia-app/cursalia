"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Check, Plus, Trash2, Video } from "lucide-react";
import { SortableList, SortableRow } from "@/components/admin/sortable";
import { StatusControl } from "@/components/admin/status-control";
import { Button } from "@/components/ui/button";
import { Badge, Card, Separator } from "@/components/ui/primitives";
import {
  deleteContentAction,
  reorderAction,
  saveCourseAction,
  saveLessonAction,
  saveModuleAction,
} from "@/lib/actions/admin-actions";
import { useServerState } from "@/lib/hooks/use-server-state";
import { formatTimecode } from "@/lib/utils";
import type { AdminCategory, AdminCourseDetail, AdminModule } from "@/lib/services/admin-query-service";

/**
 * Editor de un curso: datos, temas y capítulos.
 * En pantalla se dice siempre "Tema" y "Capítulo", nunca "módulo" ni "lección".
 */
export function CourseEditor({
  course,
  categories,
}: {
  course: AdminCourseDetail;
  categories: AdminCategory[];
}) {
  const router = useRouter();
  const [message, setMessage] = React.useState<string | null>(null);
  const [pending, startTransition] = React.useTransition();

  const [title, setTitle] = React.useState(course.title);
  const [slug, setSlug] = React.useState(course.slug);
  const [description, setDescription] = React.useState(course.description ?? "");
  const [categoryId, setCategoryId] = React.useState(course.categoryId);
  const [modules, setModules] = useServerState<AdminModule[]>(course.modules);


  const notify = (result: { ok: boolean; message?: string }) => {
    setMessage(result.ok ? "Guardado." : (result.message ?? "No se ha podido guardar."));
    if (result.ok) router.refresh();
  };

  const saveCourse = () =>
    startTransition(async () => {
      notify(
        await saveCourseAction({
          id: course.id,
          categoryId,
          title,
          slug,
          description: description || null,
        }),
      );
    });

  const addModule = () =>
    startTransition(async () => {
      notify(
        await saveModuleAction({
          courseId: course.id,
          title: `Tema ${modules.length + 1}`,
          position: modules.length,
        }),
      );
    });

  const renameModule = (moduleId: string, newTitle: string) =>
    startTransition(async () => {
      notify(await saveModuleAction({ id: moduleId, courseId: course.id, title: newTitle }));
    });

  const removeModule = (moduleId: string) =>
    startTransition(async () => {
      notify(await deleteContentAction({ entity: "module", id: moduleId }));
    });

  const reorderModules = (orderedIds: string[]) => {
    // Reordena en pantalla al soltar; el servidor confirma justo después.
    setModules((current) => orderedIds.map((id) => current.find((m) => m.id === id)!).filter(Boolean));
    startTransition(async () => {
      notify(await reorderAction({ entity: "module", orderedIds }));
    });
  };

  const addLesson = (moduleId: string, position: number) =>
    startTransition(async () => {
      notify(
        await saveLessonAction({
          moduleId,
          title: `Capítulo ${position + 1}`,
          videoProvider: "bunny",
          position,
          isPublished: false,
        }),
      );
    });

  return (
    <div className="space-y-8">
      <Card className="p-5">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-sm font-medium">Datos del curso</h2>
          <StatusControl entity="course" id={course.id} status={course.status} />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <AdminField label="Título" value={title} onChange={setTitle} />
          <AdminField label="Identificador en la URL" value={slug} onChange={setSlug} mono />

          <div className="space-y-1.5">
            <label className="text-[11px] uppercase tracking-wider text-subtle" htmlFor="categoria">
              Categoría
            </label>
            <select
              id="categoria"
              value={categoryId}
              onChange={(event) => setCategoryId(event.target.value)}
              className="w-full rounded-[10px] border border-line bg-background px-3 py-2.5 text-sm outline-none focus:border-line-strong"
            >
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1.5 sm:col-span-2">
            <label className="text-[11px] uppercase tracking-wider text-subtle" htmlFor="descripcion">
              Descripción
            </label>
            <textarea
              id="descripcion"
              rows={3}
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              className="w-full resize-y rounded-[10px] border border-line bg-background px-3 py-2.5 text-sm outline-none focus:border-line-strong"
            />
          </div>
        </div>

        <div className="mt-5 flex items-center gap-3">
          <Button variant="primary" size="sm" onClick={saveCourse} disabled={pending}>
            Guardar cambios
          </Button>
          {message ? <span className="text-[12px] text-muted">{message}</span> : null}
        </div>
      </Card>

      <section>
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="text-sm font-medium">
            Temas <span className="num text-subtle">({modules.length})</span>
          </h2>
          <Button variant="secondary" size="sm" onClick={addModule} disabled={pending}>
            <Plus className="size-3.5" strokeWidth={2} />
            Añadir tema
          </Button>
        </div>

        {modules.length === 0 ? (
          <p className="rounded-[10px] border border-dashed border-line px-5 py-10 text-center text-sm text-muted">
            Este curso todavía no tiene temas. Añade el primero para empezar a colgar capítulos.
          </p>
        ) : (
          <SortableList items={modules} onReorder={reorderModules}>
            {(module, index) => (
              <SortableRow id={module.id} className="flex-col items-stretch gap-0 p-0">
                <ModuleBlock
                  module={module}
                  index={index}
                  courseId={course.id}
                  pending={pending}
                  onRename={renameModule}
                  onRemove={removeModule}
                  onAddLesson={addLesson}
                  onNotify={notify}
                />
              </SortableRow>
            )}
          </SortableList>
        )}
      </section>
    </div>
  );
}

function ModuleBlock({
  module,
  index,
  courseId,
  pending,
  onRename,
  onRemove,
  onAddLesson,
  onNotify,
}: {
  module: AdminModule;
  index: number;
  courseId: string;
  pending: boolean;
  onRename: (moduleId: string, title: string) => void;
  onRemove: (moduleId: string) => void;
  onAddLesson: (moduleId: string, position: number) => void;
  onNotify: (result: { ok: boolean; message?: string }) => void;
}) {
  const [title, setTitle] = React.useState(module.title);
  const [lessons, setLessons] = useServerState(module.lessons);
  const [, startTransition] = React.useTransition();


  const reorderLessons = (orderedIds: string[]) => {
    setLessons((current) => orderedIds.map((id) => current.find((l) => l.id === id)!).filter(Boolean));
    startTransition(async () => {
      onNotify(await reorderAction({ entity: "lesson", orderedIds }));
    });
  };

  return (
    <div className="flex-1 py-3 pr-3">
      <div className="flex items-center gap-2">
        <span className="num text-[11px] text-subtle">
          {(index + 1).toString().padStart(2, "0")}
        </span>
        <input
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          onBlur={() => title !== module.title && onRename(module.id, title)}
          aria-label="Título del tema"
          className="min-w-0 flex-1 rounded-lg border border-transparent bg-transparent px-2 py-1 text-sm font-medium outline-none transition-colors hover:border-line focus:border-line-strong focus:bg-background"
        />
        <span className="num text-[11px] text-subtle">{lessons.length} cap.</span>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Eliminar tema"
          onClick={() => onRemove(module.id)}
          disabled={pending}
        >
          <Trash2 className="size-3.5" strokeWidth={1.75} />
        </Button>
      </div>

      <Separator className="my-3" />

      {lessons.length > 0 ? (
        <SortableList items={lessons} onReorder={reorderLessons} className="space-y-1.5">
          {(lesson) => (
            <SortableRow id={lesson.id} className="bg-background">
              <LessonRow
                lesson={lesson}
                moduleId={module.id}
                courseId={courseId}
                onNotify={onNotify}
              />
            </SortableRow>
          )}
        </SortableList>
      ) : (
        <p className="px-2 py-2 text-[12px] text-subtle">Sin capítulos todavía.</p>
      )}

      <Button
        variant="ghost"
        size="sm"
        className="mt-2"
        onClick={() => onAddLesson(module.id, lessons.length)}
      >
        <Plus className="size-3.5" strokeWidth={2} />
        Añadir capítulo
      </Button>
    </div>
  );
}

function LessonRow({
  lesson,
  moduleId,
  onNotify,
}: {
  lesson: AdminModule["lessons"][number];
  moduleId: string;
  courseId: string;
  onNotify: (result: { ok: boolean; message?: string }) => void;
}) {
  const [title, setTitle] = React.useState(lesson.title);
  const [videoId, setVideoId] = React.useState(lesson.videoId ?? "");
  const [pending, startTransition] = React.useTransition();

  const save = (overrides: Record<string, unknown> = {}) =>
    startTransition(async () => {
      onNotify(
        await saveLessonAction({
          id: lesson.id,
          moduleId,
          title,
          videoProvider: lesson.videoProvider,
          videoId: videoId || null,
          isPublished: lesson.isPublished,
          ...overrides,
        }),
      );
    });

  const remove = () =>
    startTransition(async () => {
      onNotify(await deleteContentAction({ entity: "lesson", id: lesson.id }));
    });

  return (
    <div className="flex flex-1 flex-wrap items-center gap-2 py-2 pr-2">
      <input
        value={title}
        onChange={(event) => setTitle(event.target.value)}
        onBlur={() => title !== lesson.title && save()}
        aria-label="Título del capítulo"
        className="min-w-0 flex-1 basis-48 rounded-lg border border-transparent bg-transparent px-2 py-1 text-[13px] outline-none transition-colors hover:border-line focus:border-line-strong focus:bg-card"
      />

      <div className="flex items-center gap-1.5">
        <Video className="size-3.5 shrink-0 text-subtle" strokeWidth={1.75} />
        <input
          value={videoId}
          onChange={(event) => setVideoId(event.target.value)}
          onBlur={() => videoId !== (lesson.videoId ?? "") && save()}
          placeholder="ID de Bunny"
          aria-label="Identificador del vídeo en Bunny"
          className="num w-36 rounded-lg border border-line bg-card px-2 py-1 text-[11px] outline-none focus:border-line-strong"
        />
      </div>

      <span className="num w-14 text-right text-[11px] text-subtle">
        {lesson.durationSeconds ? formatTimecode(lesson.durationSeconds) : "—"}
      </span>

      <Button
        variant={lesson.isPublished ? "secondary" : "ghost"}
        size="sm"
        onClick={() => save({ isPublished: !lesson.isPublished })}
        disabled={pending || !lesson.videoId}
        title={lesson.videoId ? undefined : "Asigna un vídeo antes de publicar"}
      >
        {lesson.isPublished ? (
          <>
            <Check className="size-3.5 text-success" strokeWidth={2.5} /> Publicado
          </>
        ) : (
          "Publicar"
        )}
      </Button>

      <Button variant="ghost" size="icon-sm" aria-label="Eliminar capítulo" onClick={remove}>
        <Trash2 className="size-3.5" strokeWidth={1.75} />
      </Button>
    </div>
  );
}

function AdminField({
  label,
  value,
  onChange,
  mono = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  mono?: boolean;
}) {
  const id = `campo-${label.toLowerCase().replace(/\s+/g, "-")}`;
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="text-[11px] uppercase tracking-wider text-subtle">
        {label}
      </label>
      <input
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className={`w-full rounded-[10px] border border-line bg-background px-3 py-2.5 text-sm outline-none focus:border-line-strong ${mono ? "num" : ""}`}
      />
    </div>
  );
}

export function StatusBadge({ status }: { status: AdminCourseDetail["status"] }) {
  if (status === "published") return <Badge tone="success">Publicado</Badge>;
  if (status === "archived") return <Badge>Archivado</Badge>;
  return <Badge tone="warn">Borrador</Badge>;
}
