import { beforeEach, describe, expect, it, vi } from "vitest";
import { asClient, ok, SupabaseStub, type SupabaseStubConfig } from "@/lib/services/testing/supabase-stub";

const createSupabaseServerClient = vi.hoisted(() => vi.fn());
vi.mock("@/lib/supabase/server", () => ({ createSupabaseServerClient }));

const { getCourseTree, getLessonContext, listCatalog } = await import("@/lib/services/catalog-service");

const USER = "11111111-1111-1111-1111-111111111111";

function stub(config: SupabaseStubConfig): SupabaseStub {
  const instance = new SupabaseStub(config);
  createSupabaseServerClient.mockResolvedValue(asClient(instance));
  return instance;
}

function lesson(id: string, position: number, published = true) {
  return { id, title: `Capítulo ${position}`, position, duration_seconds: 600, is_published: published };
}

const CATEGORIES = [
  {
    id: "cat_1",
    name: "Programación",
    slug: "programacion",
    position: 0,
    courses: [
      {
        id: "course_pub",
        slug: "curso-publicado",
        title: "Curso publicado",
        description: "Visible en el catálogo",
        cover_url: null,
        status: "published" as const,
        position: 0,
        published_at: "2026-08-01T00:00:00.000Z",
        category_id: "cat_1",
        modules: [{ id: "m1", lessons: [lesson("l1", 0), lesson("l2", 1)] }],
      },
      {
        id: "course_draft",
        slug: "curso-borrador",
        title: "Curso en borrador",
        description: "No debería salir jamás",
        cover_url: null,
        status: "draft" as const,
        position: 1,
        published_at: null,
        category_id: "cat_1",
        modules: [],
      },
      {
        id: "course_archived",
        slug: "curso-archivado",
        title: "Curso archivado",
        description: "Fuera del catálogo",
        cover_url: null,
        status: "archived" as const,
        position: 2,
        published_at: "2026-05-01T00:00:00.000Z",
        category_id: "cat_1",
        modules: [{ id: "m9", lessons: [lesson("l9", 0)] }],
      },
    ],
  },
];

beforeEach(() => vi.clearAllMocks());

describe("listCatalog", () => {
  it("un curso en borrador no aparece nunca", async () => {
    stub({ tables: { categories: ok(CATEGORIES), lesson_progress: ok([]) } });

    const catalog = await listCatalog();
    const slugs = catalog[0].courses.map((course) => course.slug);

    expect(slugs).not.toContain("curso-borrador");
  });

  it("un curso archivado sale del catálogo, aunque quien lo empezó lo conserve (RN-06)", async () => {
    stub({ tables: { categories: ok(CATEGORIES), lesson_progress: ok([]) } });

    const catalog = await listCatalog();
    const slugs = catalog[0].courses.map((course) => course.slug);

    expect(slugs).toEqual(["curso-publicado"]);
  });

  it("sin usuario no se incrusta progreso ni se consulta la tabla", async () => {
    const instance = stub({ tables: { categories: ok(CATEGORIES), lesson_progress: ok([]) } });

    const catalog = await listCatalog();

    expect(catalog[0].courses[0].progress).toBeNull();
    expect(instance.queryFor("lesson_progress")).toBeUndefined();
  });

  it("con usuario, el porcentaje se calcula desde los capítulos completados", async () => {
    stub({
      tables: {
        categories: ok(CATEGORIES),
        lesson_progress: ok([{ lesson_id: "l1", completed_at: "2026-09-01T00:00:00.000Z" }]),
      },
    });

    const catalog = await listCatalog(USER);

    expect(catalog[0].courses[0].progress).toEqual({
      completedLessons: 1,
      totalLessons: 2,
      ratio: 0.5,
      resumeLessonId: "l2",
    });
  });

  it("filtra por categoría publicada y respeta el orden manual", async () => {
    const instance = stub({ tables: { categories: ok(CATEGORIES), lesson_progress: ok([]) } });

    await listCatalog();

    const query = instance.queryFor("categories");
    expect(query?.argsOf("eq")).toEqual(["status", "published"]);
    expect(query?.argsOf("order")).toEqual(["position", { ascending: true }]);
  });
});

const COURSE_TREE = {
  id: "course_pub",
  slug: "curso-publicado",
  title: "Curso publicado",
  description: "Con temas y capítulos",
  cover_url: null,
  status: "published" as const,
  position: 0,
  published_at: "2026-08-01T00:00:00.000Z",
  category_id: "cat_1",
  categories: { name: "Programación" },
  modules: [
    {
      id: "m2",
      title: "Segundo tema",
      position: 1,
      lessons: [{ ...lesson("l3", 0), lesson_progress: [] }],
    },
    {
      id: "m1",
      title: "Primer tema",
      position: 0,
      lessons: [
        {
          ...lesson("l2", 1),
          lesson_progress: [{ last_position_seconds: 120, completed_at: null }],
        },
        {
          ...lesson("l1", 0),
          lesson_progress: [{ last_position_seconds: 600, completed_at: "2026-09-01T00:00:00.000Z" }],
        },
        { ...lesson("l_oculto", 2, false), lesson_progress: [] },
      ],
    },
  ],
};

describe("getCourseTree", () => {
  it("ordena temas y capítulos por posición, nunca alfabéticamente", async () => {
    stub({ tables: { courses: ok(COURSE_TREE) } });

    const tree = await getCourseTree("curso-publicado");

    expect(tree?.modules.map((m) => m.title)).toEqual(["Primer tema", "Segundo tema"]);
    expect(tree?.modules[0].lessons.map((l) => l.id)).toEqual(["l1", "l2"]);
  });

  it("no expone capítulos sin publicar", async () => {
    stub({ tables: { courses: ok(COURSE_TREE) } });

    const tree = await getCourseTree("curso-publicado");
    const ids = tree?.modules.flatMap((m) => m.lessons.map((l) => l.id));

    expect(ids).not.toContain("l_oculto");
    expect(tree?.lessonCount).toBe(3);
  });

  it("incrusta el progreso de cada capítulo", async () => {
    stub({ tables: { courses: ok(COURSE_TREE) } });

    const tree = await getCourseTree("curso-publicado");

    expect(tree?.modules[0].lessons[0].progress).toEqual({
      lastPositionSeconds: 600,
      completedAt: "2026-09-01T00:00:00.000Z",
    });
    expect(tree?.modules[0].lessons[1].progress?.completedAt).toBeNull();
  });

  it("suma la duración total del curso", async () => {
    stub({ tables: { courses: ok(COURSE_TREE) } });

    const tree = await getCourseTree("curso-publicado");

    expect(tree?.durationSeconds).toBe(1800);
  });

  it("devuelve null si RLS no deja ver el curso", async () => {
    stub({ tables: { courses: ok(null) } });

    await expect(getCourseTree("curso-invisible")).resolves.toBeNull();
  });
});

describe("getLessonContext", () => {
  it("resuelve el capítulo anterior y el siguiente cruzando temas", async () => {
    stub({
      tables: {
        lessons: ok({ id: "l2", modules: { id: "m1", courses: { slug: "curso-publicado" } } }),
        courses: ok(COURSE_TREE),
      },
    });

    const context = await getLessonContext("l2");

    expect(context?.module.title).toBe("Primer tema");
    expect(context?.previousLessonId).toBe("l1");
    expect(context?.nextLessonId).toBe("l3");
  });

  it("el primer capítulo no tiene anterior y el último no tiene siguiente", async () => {
    stub({
      tables: {
        lessons: ok({ id: "l1", modules: { id: "m1", courses: { slug: "curso-publicado" } } }),
        courses: ok(COURSE_TREE),
      },
    });

    const context = await getLessonContext("l1");

    expect(context?.previousLessonId).toBeNull();
    expect(context?.nextLessonId).toBe("l2");
  });

  it("devuelve null si el capítulo no es visible", async () => {
    stub({ tables: { lessons: ok(null) } });

    await expect(getLessonContext("l_oculto")).resolves.toBeNull();
  });
});
