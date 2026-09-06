"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/primitives";
import { saveSettingAction } from "@/lib/actions/admin-actions";
import { formatCents } from "@/lib/utils";
import type { AdminSettings } from "@/lib/services/admin-query-service";

/**
 * Ajustes en caliente. Los cambios tienen efecto inmediato en toda la plataforma,
 * salvo el importe de comisión: las comisiones ya generadas quedaron congeladas
 * y no se recalculan nunca (RN-11).
 */

const LABELS: Record<string, { label: string; help: string; unit?: "cents" }> = {
  trial_duration_minutes: {
    label: "Duración de la prueba",
    help: "Minutos de reloj desde que el usuario verifica su correo. No es tiempo de visionado.",
  },
  max_devices: {
    label: "Dispositivos por cuenta",
    help: "El siguiente aparato recibe un aviso claro, no un error.",
  },
  entry_commission_cents: {
    label: "Comisión de entrada",
    help: "Se copia y congela al generarse. Cambiarlo no toca comisiones anteriores.",
    unit: "cents",
  },
  grace_period_days: {
    label: "Días de cortesía",
    help: "Días con acceso tras marcar la cuenta como impagada, antes de cortar.",
  },
  device_release_cooldown_days: {
    label: "Espera entre liberaciones",
    help: "Días que deben pasar para poder liberar otro dispositivo.",
  },
  subscription_price_cents: {
    label: "Precio mensual",
    help: "Solo se muestra en el paywall. El cobro es manual; se activa desde /admin/usuarios.",
    unit: "cents",
  },
  trial_ip_cooldown_hours: {
    label: "Cooldown de trial por IP",
    help: "Horas que deben pasar antes de que otra cuenta con la misma IP arranque su prueba.",
  },
};

export function SettingsForm({ settings }: { settings: AdminSettings[] }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {settings
        .filter((setting) => LABELS[setting.key])
        .map((setting) => (
          <SettingRow key={setting.key} setting={setting} />
        ))}
    </div>
  );
}

function SettingRow({ setting }: { setting: AdminSettings }) {
  const router = useRouter();
  const meta = LABELS[setting.key];
  const [value, setValue] = React.useState(String(setting.value));
  const [state, setState] = React.useState<"idle" | "saved" | "error">("idle");
  const [pending, startTransition] = React.useTransition();

  const dirty = Number(value) !== setting.value;

  const save = () =>
    startTransition(async () => {
      const result = await saveSettingAction({ key: setting.key, value: Number(value) });
      setState(result.ok ? "saved" : "error");
      if (result.ok) router.refresh();
    });

  return (
    <Card className="flex flex-col gap-3 p-5">
      <div className="space-y-1">
        <label
          htmlFor={`ajuste-${setting.key}`}
          className="text-[13px] font-medium text-foreground"
        >
          {meta.label}
        </label>
        <p className="text-[12px] leading-relaxed text-subtle">{meta.help}</p>
      </div>

      <div className="flex items-center gap-2">
        <input
          id={`ajuste-${setting.key}`}
          value={value}
          inputMode="numeric"
          onChange={(event) => {
            setValue(event.target.value.replace(/\D/g, ""));
            setState("idle");
          }}
          className="num w-32 rounded-[10px] border border-line bg-background px-3 py-2 text-sm outline-none focus:border-line-strong"
        />
        {meta.unit === "cents" ? (
          <span className="num text-[12px] text-subtle">{formatCents(Number(value) || 0)}</span>
        ) : null}

        <Button
          variant={dirty ? "primary" : "ghost"}
          size="sm"
          className="ml-auto"
          onClick={save}
          disabled={pending || !dirty}
        >
          Guardar
        </Button>
      </div>

      {state === "saved" ? <p className="text-[11px] text-success">Guardado.</p> : null}
      {state === "error" ? <p className="text-[11px] text-danger">No se ha podido guardar.</p> : null}
    </Card>
  );
}
