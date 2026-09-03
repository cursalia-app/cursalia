import { beforeEach, describe, expect, it, vi } from "vitest";
import { asClient, ok, SupabaseStub, type SupabaseStubConfig } from "@/lib/services/testing/supabase-stub";

const createSupabaseServerClient = vi.hoisted(() => vi.fn());
vi.mock("@/lib/supabase/server", () => ({ createSupabaseServerClient }));

const {
  clearSaveThrottle,
  getCourseProgress,
  reachedCompletion,
  saveBookPage,
  saveLessonPosition,
  setLessonCompleted,
} = await import("@/lib/services/progress-service");

const USER = "11111111-1111-1111-1111-111111111111";
const COURSE = "22222222-2222-2222-2222-222222222222";

function stub(config: SupabaseStubConfig = {}): SupabaseStub {
  const instance = new SupabaseStub(config);
  createSupabaseServerClient.mockResolvedValue(asClient(instance));
  return instance;
}

function lessonRow(id: string, modulePosition: number, position: number, completed: boolean) {
  return {
    id,
    position,
    modules: { course_id: COURSE, position: modulePosition },
    lesson_progress: completed
      ? [{ completed_at: "2026-09-01T00:00:00.000Z", updated_at: "2026-09-01T00:00:00.000Z" }]
      : [],
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  clearSaveThrottle();
});

describe("saveLessonPosition", () => {
  it("guarda la posición con un upsert sobre la clave compuesta", async () => {
    const instance = stub();

    await saveLessonPosition(USER, "lesson_1", 128.7);

    const [payload, options] = instance.queryFor("lesson_progress")?.argsOf("upsert") ?? [];
    expect(payload).toMatchObject({
      user_id: USER,
      lesson_id: "lesson_1",
      last_position_seconds: 128,
    });
    expect(options).toEqual({ onConflict: "user_id,lesson_id" });
  });

  it("nunca guarda una posición negativa", async () => {
    const instance = stub();

    await saveLessonPosition(USER, "lesson_1", -5);

    const [payload] = instance.queryFor("lesson_progress")?.argsOf("upsert") ?? [];
    expect(payload).toMatchObject({ last_position_seconds: 0 });
  });

  it("limita la frecuencia: el reproductor avisa más de lo que hace falta escribir", async () => {
    const instance = stub();

    await saveLessonPosition(USER, "lesson_1", 10);
    await saveLessonPosition(USER, "lesson_1", 20);

    expect(instance.queries.lesson_progress).toHaveLength(1);
  });

  it("el límite es por capítulo, no global", async () => {
    const instance = stub();

    await saveLessonPosition(USER, "lesson_1", 10);
    await saveLessonPosition(USER, "lesson_2", 10);

    expect(instance.queries.lesson_progress).toHaveLength(2);
  });
});

describe("setLessonCompleted", () => {
  it("marca con la fecha del momento", async () => {
    const instance = stub();

    await setLessonCompleted(USER, "lesson_1", true);

    const [payload] = instance.queryFor("lesson_progress")?.argsOf("upsert") ?? [];
    expect(payload).toMatchObject({ completed_at: expect.any(String) });
  });

  it("desmarcar deja la fecha en null, sin borrar la fila ni la posición", async () => {
    const instance = stub();

    await setLessonCompleted(USER, "lesson_1", false);

    const [payload] = instance.queryFor("lesson_progress")?.argsOf("upsert") ?? [];
    expect(payload).toMatchObject({ completed_at: null });
    expect(instance.queryFor("lesson_progress")?.argsOf("delete")).toBeUndefined();
  });
});

describe("saveBookPage", () => {
  it("la página mínima es la 1", async () => {
    const instance = stub();

    await saveBookPage(USER, "book_1", 0);

    const [payload] = instance.queryFor("book_progress")?.argsOf("upsert") ?? [];
    expect(payload).toMatchObject({ last_page: 1 });
  });
});

describe("getCourseProgress", () => {
  it("calcula el porcentaje: no lee ninguna columna de agregado", async () => {
    stub({
      tables: {
        lessons: ok([
          lessonRow("l1", 0, 0, true),
          lessonRow("l2", 0, 1, true),
          lessonRow("l3", 1, 0, false),
          lessonRow("l4", 1, 1, false),
        ]),
      },
    });

    await expect(getCourseProgress(USER, COURSE)).resolves.toEqual({
      completedLessons: 2,
      totalLessons: 4,
      ratio: 0.5,
      resumeLessonId: "l3",
    });
  });

  it("retoma por el primer capítulo pendiente en el orden real del curso", async () => {
    stub({
      tables: {
        lessons: ok([
          lessonRow("l4", 1, 1, false),
          lessonRow("l1", 0, 0, true),
          lessonRow("l3", 1, 0, false),
          lessonRow("l2", 0, 1, false),
        ]),
      },
    });

    const progress = await getCourseProgress(USER, COURSE);
    expect(progress.resumeLessonId).toBe("l2");
  });

  it("un curso terminado no tiene por dónde retomarse", async () => {
    stub({ tables: { lessons: ok([lessonRow("l1", 0, 0, true)]) } });

    const progress = await getCourseProgress(USER, COURSE);
    expect(progress.ratio).toBe(1);
    expect(progress.resumeLessonId).toBeNull();
  });

  it("un curso sin capítulos publicados no divide entre cero", async () => {
    stub({ tables: { lessons: ok([]) } });

    await expect(getCourseProgress(USER, COURSE)).resolves.toEqual({
      completedLessons: 0,
      totalLessons: 0,
      ratio: 0,
      resumeLessonId: null,
    });
  });
});

describe("reachedCompletion", () => {
  it("un capítulo se da por visto al llegar al 90 %", () => {
    expect(reachedCompletion(899, 1000)).toBe(false);
    expect(reachedCompletion(900, 1000)).toBe(true);
  });

  it("sin duración conocida no se marca nada por las bravas", () => {
    expect(reachedCompletion(100, 0)).toBe(false);
  });
});
