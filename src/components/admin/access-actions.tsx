"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { extendAccessAction, revokeAccessAction } from "@/lib/actions/admin-actions";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Botones inline para el listado de usuarios. Abren un diálogo compacto
 * (sin librería) donde el admin declara meses e importe opcional. La
 * confirmación de "cortar acceso" también pasa por diálogo para no
 * disparar la acción con un clic accidental.
 */
export function AccessActions({
  userId,
  hasSubscription,
}: {
  userId: string;
  hasSubscription: boolean;
}) {
  const [mode, setMode] = useState<"idle" | "extend" | "revoke">("idle");

  return (
    <div className="flex items-center gap-1.5">
      <button
        type="button"
        onClick={() => setMode("extend")}
        className="rounded-md border border-line px-2 py-1 text-[11px] text-muted transition-colors hover:border-line-strong hover:text-foreground"
      >
        Extender
      </button>
      {hasSubscription ? (
        <button
          type="button"
          onClick={() => setMode("revoke")}
          className="rounded-md border border-line px-2 py-1 text-[11px] text-danger transition-colors hover:border-danger/60"
        >
          Cortar
        </button>
      ) : null}

      {mode === "extend" ? (
        <ExtendDialog userId={userId} onClose={() => setMode("idle")} />
      ) : null}
      {mode === "revoke" ? (
        <RevokeDialog userId={userId} onClose={() => setMode("idle")} />
      ) : null}
    </div>
  );
}

function ExtendDialog({ userId, onClose }: { userId: string; onClose: () => void }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [months, setMonths] = useState<number>(1);
  const [amountEuros, setAmountEuros] = useState<string>("");
  const [note, setNote] = useState<string>("");
  const [error, setError] = useState<string | null>(null);

  const submit = () => {
    setError(null);
    const cents = amountEuros.trim()
      ? Math.round(Number(amountEuros.replace(",", ".")) * 100)
      : null;

    if (cents !== null && (!Number.isFinite(cents) || cents < 0)) {
      setError("Importe no válido");
      return;
    }

    startTransition(async () => {
      const result = await extendAccessAction({
        userId,
        months,
        amountCents: cents,
        note: note.trim() || null,
      });
      if (!result.ok) {
        setError(result.message ?? "No se pudo extender");
        return;
      }
      router.refresh();
      onClose();
    });
  };

  return (
    <DialogShell title="Extender acceso" onClose={onClose}>
      <Field label="Meses">
        <input
          type="number"
          min={1}
          max={24}
          value={months}
          onChange={(event) => setMonths(Math.max(1, Math.min(24, Number(event.target.value) || 1)))}
          className={inputClass}
        />
      </Field>
      <Field label="Importe cobrado (€, opcional)">
        <input
          type="text"
          inputMode="decimal"
          placeholder="29,00"
          value={amountEuros}
          onChange={(event) => setAmountEuros(event.target.value)}
          className={inputClass}
        />
      </Field>
      <Field label="Nota (opcional)">
        <input
          type="text"
          maxLength={500}
          placeholder="Ej.: transferencia BBVA 03/09"
          value={note}
          onChange={(event) => setNote(event.target.value)}
          className={inputClass}
        />
      </Field>

      {error ? <p className="text-[12px] text-danger">{error}</p> : null}

      <div className="flex justify-end gap-2 pt-1">
        <Button type="button" variant="ghost" size="sm" onClick={onClose} disabled={pending}>
          Cancelar
        </Button>
        <Button type="button" variant="primary" size="sm" onClick={submit} disabled={pending}>
          {pending ? "Extendiendo…" : "Confirmar"}
        </Button>
      </div>
    </DialogShell>
  );
}

function RevokeDialog({ userId, onClose }: { userId: string; onClose: () => void }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [reason, setReason] = useState<string>("");
  const [error, setError] = useState<string | null>(null);

  const submit = () => {
    setError(null);
    startTransition(async () => {
      const result = await revokeAccessAction({ userId, reason: reason.trim() || null });
      if (!result.ok) {
        setError(result.message ?? "No se pudo cortar");
        return;
      }
      router.refresh();
      onClose();
    });
  };

  return (
    <DialogShell title="Cortar acceso" onClose={onClose}>
      <p className="text-[13px] text-muted">
        El acceso se corta al instante. Las URLs firmadas ya emitidas caducan solas en menos de
        cuatro horas. El progreso del usuario se conserva.
      </p>
      <Field label="Motivo (opcional)">
        <input
          type="text"
          maxLength={500}
          placeholder="Ej.: impago noviembre"
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          className={inputClass}
        />
      </Field>

      {error ? <p className="text-[12px] text-danger">{error}</p> : null}

      <div className="flex justify-end gap-2 pt-1">
        <Button type="button" variant="ghost" size="sm" onClick={onClose} disabled={pending}>
          Cancelar
        </Button>
        <Button type="button" variant="danger" size="sm" onClick={submit} disabled={pending}>
          {pending ? "Cortando…" : "Cortar acceso"}
        </Button>
      </div>
    </DialogShell>
  );
}

/* --- Piezas pequeñas ----------------------------------------------------- */

const inputClass =
  "w-full rounded-[10px] border border-line bg-background px-3 py-2 text-sm outline-none placeholder:text-subtle focus:border-line-strong";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <span className="text-[11px] uppercase tracking-wider text-subtle">{label}</span>
      {children}
    </label>
  );
}

function DialogShell({
  title,
  children,
  onClose,
}: {
  title: string;
  children: React.ReactNode;
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-background/70 backdrop-blur-sm"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        className={cn(
          "w-full max-w-md space-y-4 rounded-[12px] border border-line bg-surface p-6 shadow-xl",
        )}
      >
        <h3 className="text-base font-medium tracking-[-0.01em]">{title}</h3>
        {children}
      </div>
    </div>
  );
}
