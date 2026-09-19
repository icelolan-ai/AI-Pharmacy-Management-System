import { apiFetch, buildQuery, type Page } from "@/lib/api/client";

/** GET /audit-logs (owner only). Field names follow the OpenAPI contract:
 *  the writer is `changed_by_name`, not `user_name`, and actions come back
 *  lowercase ("insert" / "update" / "delete"). */
export type AuditLog = {
  id: string;
  created_at: string;
  changed_by: string | null;
  changed_by_name: string | null;
  action: string;
  table_name: string;
  record_id: string;
  old_value: Record<string, unknown> | null;
  new_value: Record<string, unknown> | null;
  reason: string | null;
};

export function listAuditLogs({
  tableName,
  recordId,
  changedBy,
  dateFrom,
  dateTo,
  limit = 25,
  offset = 0,
  signal,
}: {
  tableName?: string | null;
  recordId?: string | null;
  changedBy?: string | null;
  dateFrom?: string | null;
  dateTo?: string | null;
  limit?: number;
  offset?: number;
  signal?: AbortSignal;
} = {}): Promise<Page<AuditLog>> {
  const query = buildQuery({
    table_name: tableName,
    record_id: recordId,
    changed_by: changedBy,
    date_from: dateFrom,
    date_to: dateTo,
    limit,
    offset,
  });
  return apiFetch<Page<AuditLog>>(`/api/v1/audit-logs${query}`, { signal, cache: "no-store" });
}
