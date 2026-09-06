import Link from "next/link";
import { AlertTriangle, Clock } from "lucide-react";
import { Card } from "@/components/ui/primitives";
import { formatDate } from "@/lib/utils";
import type { AdminExpiringSubscription } from "@/lib/services/admin-query-service";

/**
 * Lista de accesos que caducan pronto o ya caducaron. Cada fila enlaza a
 * `/admin/usuarios?q=<email>` para que el admin pueda extenderlo o cortarlo
 * desde el mismo listado donde ya están las acciones.
 */
export function ExpiringPanel({ items }: { items: AdminExpiringSubscription[] }) {
  if (items.length === 0) {
    return (
      <Card className="px-5 py-8 text-center text-sm text-muted">
        Nadie caduca en los próximos días.
      </Card>
    );
  }

  const expired = items.filter((item) => item.kind === "expired");
  const upcoming = items.filter((item) => item.kind === "upcoming");

  return (
    <Card className="divide-y divide-line">
      {expired.map((item) => (
        <Row key={item.subscriptionId} item={item} />
      ))}
      {upcoming.map((item) => (
        <Row key={item.subscriptionId} item={item} />
      ))}
    </Card>
  );
}

function Row({ item }: { item: AdminExpiringSubscription }) {
  const isExpired = item.kind === "expired";
  const label = isExpired
    ? `Caducó hace ${Math.abs(item.daysLeft)} ${Math.abs(item.daysLeft) === 1 ? "día" : "días"}`
    : item.daysLeft <= 0
      ? "Caduca hoy"
      : `Caduca en ${item.daysLeft} ${item.daysLeft === 1 ? "día" : "días"}`;

  return (
    <Link
      href={`/admin/usuarios?q=${encodeURIComponent(item.email)}`}
      className="flex items-center justify-between gap-3 px-5 py-3 text-[13px] transition-colors hover:bg-card/60"
    >
      <div className="flex min-w-0 items-center gap-2.5">
        {isExpired ? (
          <AlertTriangle className="size-3.5 shrink-0 text-danger" strokeWidth={2} aria-hidden />
        ) : (
          <Clock className="size-3.5 shrink-0 text-warn" strokeWidth={2} aria-hidden />
        )}
        <span className="min-w-0 truncate text-foreground">{item.email}</span>
      </div>
      <div className="flex shrink-0 items-center gap-3">
        <span className="num text-[11px] text-subtle">{formatDate(item.currentPeriodEnd)}</span>
        <span
          className={`num text-[11px] ${isExpired ? "text-danger" : "text-muted"}`}
        >
          {label}
        </span>
      </div>
    </Link>
  );
}
