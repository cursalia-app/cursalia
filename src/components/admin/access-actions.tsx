"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  deleteUserAction,
  extendAccessAction,
  revokeAccessAction,
  toggleAdminAction,
} from "@/lib/actions/admin-actions";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Acciones inline por fila en el listado de usuarios: extender el acceso,
 * cortarlo, promover o degradar el rol de admin, y baja RGPD. La baja pide
 * doble confirmación (diálogo + texto) porque no es reversible.
 *
 * El usuario NO puede aplicar ninguna acción sobre sí mismo aparte de
 * extender: la RPC lo rechaza, y ocultarlas también aquí evita el 400.
 */
export function AccessActions({
  userId,
  hasSubscription,
  isAdmin,
  isSelf,
  isDeleted,
}: {
  userId: string;
  hasSubscription: boolean;
  isAdmin: boolean;
  isSelf: boolean;
  isDeleted: boolean;
}) {
  const [mode, setMode] = useState<"idle" | "extend" | "revoke" | "delete">("idle");

  if (isDeleted) {
    return <span className="text-[11px] italic text-subtle">Cuenta cerrada</span>;
  }

  return (
    <div className="flex flex-wrap items-center justify-end gap-1.5">
      <ActionButton onClick={() => setMode("extend")}>Extender</ActionButton>
      {hasSubscription ? (
        <ActionButton tone="danger" onClick={() => setMode("revoke")}>
          Cortar
        </ActionButton>
      ) : null}
      {!isSelf ? (
        <AdminToggleButton userId={userId} isAdmin={isAdmin} />
      ) : null}
      {!isSelf ? (
        <ActionButton tone="danger" onClick={() => setMode("delete")}>
          Borrar
        </ActionButton>
      ) : null}

      {mode === "extend" ? (
        <ExtendDialog userId={userId} onClose={() => setMode("idle")} />
      ) : null}
      {mode === "revoke" ? (
        <RevokeDialog userId={userId} onClose={() => setMode("idle")} />
      ) : null}
      {mode === "delete" ? (
        <DeleteDialog userId={userId} onClose={() => setMode("idle")} />
      ) : null}
    </div>
  );
}

function ActionButton({
  onClick,
  children,
  tone = "neutral",
  disabled,
}: {
  onClick: () => void;
  children: React.ReactNode;
  tone?: "neutral" | "danger";
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "rounded-md border px-2 py-1 text-[11px] transition-colors disabled:opacity-40",
        tone === "danger"
          ? "border-line text-danger hover:border-danger/60"
          : "border-line text-muted hover:border-line-strong hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}

/**
 * Toggle inline sin diálogo. Es un cambio reversible y no destructivo:
 * el confirm nativo del navegador es suficiente para evitar clics accidentales.
 */
function AdminToggleButton({ userId, isAdmin }: { userId: string; isAdmin: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const submit = () => {
    const message = isAdmin
      ? "¿Quitar el rol de administrador?"
      : "¿Dar rol de administrador?";
    if (!window.confirm(message)) return;

    startTransition(async () => {
      const result = await toggleAdminAction({ userId, makeAdmin: !isAdmin });
      if (!result.ok) {
        window.alert(result.message ?? "No se pudo cambiar");
        return;
      }
      router.refresh();
    });
  };

  return (
    <ActionButton onClick={submit} disabled={pending}>
      {isAdmin ? "Quitar admin" : "Hacer admin"}
    </ActionButton>
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

/**
 * Baja RGPD. Pedimos escribir la palabra "BORRAR" para evitar clics
 * accidentales; el correo, el trial y la IP se anonimizan; el histórico
 * de pagos y auditoría se mantiene, ahora referido a un perfil borrado.
 */
function DeleteDialog({ userId, onClose }: { userId: string; onClose: () => void }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [reason, setReason] = useState<string>("");
  const [confirmation, setConfirmation] = useState<string>("");
  const [error, setError] = useState<string | null>(null);

  const submit = () => {
    setError(null);
    if (confirmation.trim().toUpperCase() !== "BORRAR") {
      setError("Escribe BORRAR para confirmar.");
      return;
    }

    startTransition(async () => {
      const result = await deleteUserAction({ userId, reason: reason.trim() || null });
      if (!result.ok) {
        setError(result.message ?? "No se pudo borrar");
        return;
      }
      router.refresh();
      onClose();
    });
  };

  return (
    <DialogShell title="Cerrar la cuenta del usuario" onClose={onClose}>
      <p className="text-[13px] text-muted">
        Se anonimiza el correo y la IP, se corta la suscripción y se liberan los dispositivos.
        El histórico de pagos y auditoría se mantiene por trazabilidad contable. No es reversible.
      </p>
      <Field label="Motivo (queda en el audit)">
        <input
          type="text"
          maxLength={500}
          placeholder="Ej.: solicitud RGPD del titular"
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          className={inputClass}
        />
      </Field>
      <Field label='Escribe "BORRAR" para confirmar'>
        <input
          type="text"
          autoComplete="off"
          value={confirmation}
          onChange={(event) => setConfirmation(event.target.value)}
          className={inputClass}
        />
      </Field>
      {error ? <p className="text-[12px] text-danger">{error}</p> : null}
      <div className="flex justify-end gap-2 pt-1">
        <Button type="button" variant="ghost" size="sm" onClick={onClose} disabled={pending}>
          Cancelar
        </Button>
        <Button type="button" variant="danger" size="sm" onClick={submit} disabled={pending}>
          {pending ? "Borrando…" : "Cerrar cuenta"}
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
        className="w-full max-w-md space-y-4 rounded-[12px] border border-line bg-surface p-6 shadow-xl"
      >
        <h3 className="text-base font-medium tracking-[-0.01em]">{title}</h3>
        {children}
      </div>
    </div>
  );
}
