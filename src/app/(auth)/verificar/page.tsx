import type { Metadata } from "next";
import Link from "next/link";
import { MailCheck } from "lucide-react";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = { title: "Verifica tu correo" };

export default function VerifyPage() {
  return (
    <div className="space-y-6 text-center">
      <span className="mx-auto flex size-11 items-center justify-center rounded-full border border-line bg-card">
        <MailCheck className="size-4 text-muted" strokeWidth={1.75} />
      </span>

      <div className="space-y-2">
        <h1 className="text-xl font-semibold tracking-[-0.02em]">Confirma tu correo</h1>
        <p className="text-[13px] leading-relaxed text-muted">
          Te hemos enviado un enlace. Tus 30 minutos de prueba empiezan a contar en el momento en
          que lo abras, así que hazlo cuando tengas un rato para mirar el catálogo.
        </p>
      </div>

      <Button asChild variant="secondary" size="lg" className="w-full">
        <Link href="/entrar">Ya lo he confirmado</Link>
      </Button>
    </div>
  );
}
