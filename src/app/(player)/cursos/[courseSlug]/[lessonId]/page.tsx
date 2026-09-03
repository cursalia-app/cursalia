import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { Paywall } from "@/components/access/paywall";
import { AccessChip } from "@/components/access/trial-countdown";
import { CourseTree } from "@/components/catalog/course-tree";
import { LessonPlayer } from "@/components/player/lesson-player";
import { Logo } from "@/components/brand/logo";
import { getAccessState } from "@/lib/services/access-service";
import { getCourseTree, getLessonContext } from "@/lib/services/catalog-service";
import { getSetting } from "@/lib/services/settings-service";
import { getCurrentProfile } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

interface Params {
  params: Promise<{ courseSlug: string; lessonId: string }>;
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { lessonId } = await params;
  const context = await getLessonContext(lessonId);
  return { title: context ? `${context.lesson.title} · ${context.course.title}` : "Capítulo" };
}

export default async function LessonPage({ params }: Params) {
  const { courseSlug, lessonId } = await params;

  const profile = await getCurrentProfile();
  if (!profile) redirect(`/entrar?siguiente=/cursos/${courseSlug}/${lessonId}`);

  const [tree, context, access] = await Promise.all([
    getCourseTree(courseSlug),
    getLessonContext(lessonId),
    getAccessState(profile.id),
  ]);

  if (!tree || !context) notFound();

  /*
   * Sin acceso se sirve la pantalla de suscripción, no un error: el HTML de un
   * capítulo de pago no llega nunca al navegador de quien no puede verlo, y la
   * URL firmada tampoco se emitiría aunque llegase.
   */
  if (access.kind === "none") {
    const priceCents = await getSetting("subscription_price_cents");
    return (
      <Paywall
        reason={profile.trialStartedAt ? "trial_ended" : "no_trial"}
        priceCents={priceCents}
      />
    );
  }

  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-line bg-background/90 px-4 backdrop-blur">
        <Link
          href={`/cursos/${courseSlug}`}
          className="inline-flex items-center gap-1.5 text-[13px] text-muted hover:text-foreground"
        >
          <ChevronLeft className="size-4" strokeWidth={1.75} />
          <span className="hidden sm:inline">{context.course.title}</span>
          <span className="sm:hidden">Volver</span>
        </Link>
        <Link href="/" aria-label="Cursalia, ir al inicio" className="mx-auto">
          <Logo compact className="lg:hidden" />
        </Link>
        <div className="ml-auto">
          <AccessChip access={access} />
        </div>
      </header>

      <div className="mx-auto grid w-full max-w-[1600px] gap-6 px-4 py-6 lg:grid-cols-[minmax(0,1fr)_360px] lg:px-8">
        <LessonPlayer context={context} courseSlug={courseSlug} fallbackWatermark={profile.email} />

        <aside className="lg:sticky lg:top-20 lg:max-h-[calc(100dvh-6rem)] lg:overflow-y-auto">
          <h2 className="mb-3 text-[13px] font-medium uppercase tracking-wider text-subtle">
            Contenido del curso
          </h2>
          <CourseTree tree={tree} activeLessonId={lessonId} />
        </aside>
      </div>
    </div>
  );
}
