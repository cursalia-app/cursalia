import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { AuditLogRow } from "@/lib/types/database";

/**
 * Trazabilidad de las acciones de administración.
 * La tabla no tiene policy de INSERT: se escribe siempre con `service_role`, de
 * modo que nadie pueda fabricar ni alterar un registro desde el cliente.
 */

export interface AuditEntry {
  id: string;
  actorId: string | null;
  action: string;
  entityType: string;
  entityId: string | null;
  diff: unknown;
  createdAt: string;
}

export interface AuditFilters {
  actorId?: string;
  entityType?: string;
  entityId?: string;
  limit?: number;
}

export async function log(
  actorId: string | null,
  action: string,
  entityType: string,
  entityId: string | null,
  diff: unknown = null,
): Promise<void> {
  const supabase = createSupabaseAdminClient();

  const { error } = await supabase.from("audit_log").insert({
    actor_id: actorId,
    action,
    entity_type: entityType,
    entity_id: entityId,
    diff,
  });

  // Una auditoría rota no puede tumbar la operación que la genera, pero tampoco
  // puede pasar desapercibida.
  if (error) {
    console.error("[audit-service] no se pudo registrar la acción", { action, entityType, error });
  }
}

export async function listAuditEntries(filters: AuditFilters = {}): Promise<AuditEntry[]> {
  const supabase = await createSupabaseServerClient();

  let query = supabase
    .from("audit_log")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(filters.limit ?? 100);

  if (filters.actorId) query = query.eq("actor_id", filters.actorId);
  if (filters.entityType) query = query.eq("entity_type", filters.entityType);
  if (filters.entityId) query = query.eq("entity_id", filters.entityId);

  const { data, error } = await query;
  if (error) throw new Error(`audit-service: ${error.message}`);

  return (data ?? []).map(toAuditEntry);
}

function toAuditEntry(row: AuditLogRow): AuditEntry {
  return {
    id: row.id,
    actorId: row.actor_id,
    action: row.action,
    entityType: row.entity_type,
    entityId: row.entity_id,
    diff: row.diff,
    createdAt: row.created_at,
  };
}
