import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { Paywall } from "@/components/access/paywall";
import { BookReader } from "@/components/reader/book-reader";
import { getAccessState } from "@/lib/services/access-service";
import { getBook, getBookmark } from "@/lib/services/book-service";
import { getSetting } from "@/lib/services/settings-service";
import { getCurrentProfile } from "@/lib/supabase/server";

interface Params {
  params: Promise<{ bookSlug: string }>;
  searchParams: Promise<{ pagina?: string }>;
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { bookSlug } = await params;
  const book = await getBook(bookSlug);
  return { title: book?.title ?? "Libro" };
}

export default async function BookPage({ params, searchParams }: Params) {
  const { bookSlug } = await params;
  const { pagina } = await searchParams;

  const profile = await getCurrentProfile();
  if (!profile) redirect(`/entrar?siguiente=/libros/${bookSlug}`);

  const book = await getBook(bookSlug);
  if (!book) notFound();

  const access = await getAccessState(profile.id);
  if (access.kind === "none") {
    const priceCents = await getSetting("subscription_price_cents");
    return (
      <Paywall
        title="Este libro requiere suscripción"
        reason={profile.trialStartedAt ? "trial_ended" : "no_trial"}
        priceCents={priceCents}
      />
    );
  }

  // La página del enlace manda; si no viene, se retoma por el marcapáginas.
  const requested = Number(pagina);
  const startPage =
    Number.isFinite(requested) && requested > 0 ? requested : await getBookmark(book.id, profile.id);

  return (
    <BookReader
      bookId={book.id}
      title={book.title}
      author={book.author}
      pageCount={book.pageCount}
      startPage={startPage}
      isDownloadable={book.isDownloadable}
      watermark={profile.email}
    />
  );
}
