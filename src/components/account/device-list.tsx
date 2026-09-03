"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Monitor } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge, Card } from "@/components/ui/primitives";
import { releaseDeviceAction } from "@/lib/actions/learner-actions";
import { formatDate } from "@/lib/utils";
import type { UserDevice } from "@/lib/types/domain";

export function DeviceList({ devices, maxDevices }: { devices: UserDevice[]; maxDevices: number }) {
  const router = useRouter();
  const [message, setMessage] = React.useState<string | null>(null);
  const [pending, startTransition] = React.useTransition();

  const release = (deviceId: string) =>
    startTransition(async () => {
      const result = await releaseDeviceAction(deviceId);
      setMessage(result.ok ? null : (result.message ?? "No se ha podido liberar."));
      if (result.ok) router.refresh();
    });

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="flex flex-1 gap-1.5">
          {Array.from({ length: maxDevices }, (_, index) => (
            <span
              key={index}
              className={`h-1.5 flex-1 rounded-full ${index < devices.length ? "bg-primary" : "bg-line"}`}
            />
          ))}
        </div>
        <span className="num text-[12px] text-subtle">
          {devices.length}/{maxDevices}
        </span>
      </div>

      {message ? (
        <p role="alert" className="rounded-lg border border-warn/30 bg-warn/10 px-3 py-2 text-[13px] text-warn">
          {message}
        </p>
      ) : null}

      <div className="space-y-3">
        {devices.map((device) => (
          <Card key={device.id} className="flex items-center gap-4 p-4">
            <Monitor className="size-4 shrink-0 text-muted" strokeWidth={1.75} />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <p className="truncate text-sm">{device.label}</p>
                {device.isCurrent ? <Badge tone="outline">Este dispositivo</Badge> : null}
              </div>
              <p className="num text-[12px] text-subtle">
                Último uso: {formatDate(device.lastSeenAt)}
              </p>
            </div>
            <Button
              variant="ghost"
              size="sm"
              disabled={pending}
              onClick={() => release(device.id)}
            >
              Liberar
            </Button>
          </Card>
        ))}

        {devices.length === 0 ? (
          <p className="rounded-[10px] border border-dashed border-line px-5 py-10 text-center text-sm text-muted">
            No hay ningún dispositivo registrado todavía.
          </p>
        ) : null}
      </div>
    </div>
  );
}
