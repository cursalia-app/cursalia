"use client";

import * as React from "react";
import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import type { FormState } from "@/lib/actions/auth-actions";

/**
 * Formulario de autenticación. Un solo componente para entrar, registrarse y
 * recuperar: cambian los campos y la acción, no el comportamiento.
 */
export function AuthForm({
  action,
  submitLabel,
  children,
  footer,
}: {
  action: (prev: FormState, formData: FormData) => Promise<FormState>;
  submitLabel: string;
  children?: React.ReactNode;
  footer?: React.ReactNode;
}) {
  const [state, formAction, pending] = useActionState(action, {});

  return (
    <form action={formAction} className="space-y-4">
      {children}

      {state.error ? (
        <p
          role="alert"
          className="rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-[13px] text-danger"
        >
          {state.error}
        </p>
      ) : null}

      {state.notice ? (
        <p
          role="status"
          className="rounded-lg border border-success/30 bg-success/10 px-3 py-2 text-[13px] text-success"
        >
          {state.notice}
        </p>
      ) : null}

      <Button type="submit" variant="primary" size="lg" className="w-full" disabled={pending}>
        {pending ? "Un momento…" : submitLabel}
      </Button>

      {footer}
    </form>
  );
}

export function Field({
  label,
  name,
  type = "text",
  autoComplete,
  required = true,
  defaultValue,
  hint,
}: {
  label: string;
  name: string;
  type?: string;
  autoComplete?: string;
  required?: boolean;
  defaultValue?: string;
  hint?: string;
}) {
  const id = `campo-${name}`;

  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="text-[11px] uppercase tracking-wider text-subtle">
        {label}
      </label>
      <input
        id={id}
        name={name}
        type={type}
        required={required}
        autoComplete={autoComplete}
        defaultValue={defaultValue}
        className="w-full rounded-[10px] border border-line bg-card px-3 py-2.5 text-sm text-foreground outline-none transition-colors placeholder:text-subtle focus:border-line-strong"
      />
      {hint ? <p className="text-[11px] text-subtle">{hint}</p> : null}
    </div>
  );
}
