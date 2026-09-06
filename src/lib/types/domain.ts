/**
 * Tipos de dominio de Cursalia.
 * En la interfaz, `Module` se llama SIEMPRE "Tema" y `Lesson` "Capítulo".
 */

export type ContentStatus = "draft" | "published" | "archived";
export type SubscriptionStatus = "active" | "past_due" | "canceled" | "expired";
export type CommissionStatus = "pending" | "approved" | "paid" | "rejected";

/** Estado de acceso derivado (RN-02). Nunca se almacena: se calcula. */
export type AccessState =
  | { kind: "subscribed"; renewsAt: string | null }
  | { kind: "grace"; graceEndsAt: string }
  | { kind: "trial"; trialEndsAt: string }
  | { kind: "none" };

export interface Profile {
  id: string;
  email: string;
  isAdmin: boolean;
  createdAt: string;
}

export interface Category {
  id: string;
  name: string;
  slug: string;
  position: number;
}

export interface Lesson {
  id: string;
  title: string;
  position: number;
  durationSeconds: number;
  /** Progreso del usuario en este capítulo. Ausente si no lo ha abierto nunca. */
  progress?: LessonProgress;
}

export interface LessonProgress {
  lastPositionSeconds: number;
  completedAt: string | null;
}

/** Se muestra como "Tema". */
export interface CourseModule {
  id: string;
  title: string;
  position: number;
  lessons: Lesson[];
}

export interface Course {
  id: string;
  slug: string;
  title: string;
  description: string;
  categoryId: string;
  categoryName: string;
  status: ContentStatus;
  coverUrl: string | null;
  moduleCount: number;
  lessonCount: number;
  durationSeconds: number;
  publishedAt: string | null;
}

/** Curso con su árbol completo, tal y como lo devuelve `getCourseTree`. */
export interface CourseTree extends Course {
  modules: CourseModule[];
}

/** Progreso agregado: SIEMPRE calculado, jamás leído de una columna. */
export interface CourseProgress {
  completedLessons: number;
  totalLessons: number;
  ratio: number;
  /** Capítulo por el que retomar. Null si el curso está terminado o sin empezar. */
  resumeLessonId: string | null;
}

export interface CategoryWithCourses extends Category {
  courses: CourseWithProgress[];
}

export interface CourseWithProgress extends Course {
  progress: CourseProgress | null;
}

export interface Book {
  id: string;
  slug: string;
  title: string;
  author: string | null;
  description: string;
  coverUrl: string | null;
  pageCount: number;
  isDownloadable: boolean;
  status: ContentStatus;
  publishedAt: string | null;
}

export interface BookProgress {
  lastPage: number;
  completedAt: string | null;
  ratio: number;
}

export interface BookWithProgress extends Book {
  progress: BookProgress | null;
}

/** Tarjeta de "Continuar": mezcla cursos y libros ordenados por actividad. */
export type ContinueItem =
  | {
      kind: "course";
      course: CourseWithProgress;
      resumeLessonId: string;
      resumeLessonTitle: string;
      updatedAt: string;
    }
  | {
      kind: "book";
      book: BookWithProgress;
      resumePage: number;
      updatedAt: string;
    };

export interface LessonContext {
  course: Pick<Course, "id" | "slug" | "title">;
  module: Pick<CourseModule, "id" | "title">;
  lesson: Lesson;
  previousLessonId: string | null;
  nextLessonId: string | null;
}

export interface UserDevice {
  id: string;
  fingerprint: string;
  label: string;
  userAgent: string | null;
  lastSeenAt: string;
  isCurrent: boolean;
}

export interface Subscription {
  status: SubscriptionStatus;
  currentPeriodEnd: string | null;
  pastDueSince: string | null;
  /** Cierto solo si status='active' Y currentPeriodEnd está en el futuro. */
  isActive: boolean;
}

export interface AffiliateReferral {
  id: string;
  maskedEmail: string;
  signedUpAt: string;
  commissionStatus: CommissionStatus | null;
  commissionCents: number | null;
}

export interface AffiliateDashboard {
  code: string;
  link: string;
  referrals: AffiliateReferral[];
  totalEarnedCents: number;
  totalPendingCents: number;
}
