import { apiFetch, buildQuery, type Page } from "@/lib/api/client";

export type RiskLevel = "critical" | "high_risk" | "warning" | "normal";

/** One row of GET /reports/stock (docs/03-api-openapi.json).
 *  Cost fields are absent entirely for staff — never null, absent. */
export type StockRow = {
  medicine_id: string;
  name: string;
  strength: string | null;
  category: string | null;
  unit: string;
  /** Sellable stock only: lots still within D10. */
  available_quantity: number;
  expired_quantity: number;
  reorder_point: number | null;
  lot_count: number;
  /** The sellable lot that expires first; null when nothing sellable is left. */
  nearest_expiry: string | null;
  /** Raw value (D19) — pass through lib/format/expiry before showing it. */
  days_remaining: number | null;
  risk_level: RiskLevel | null;
  available_value?: string;
  expired_value?: string;
};

export function listStockReport({
  q,
  category,
  limit = 200,
  offset = 0,
  signal,
}: {
  q?: string | null;
  category?: string | null;
  limit?: number;
  offset?: number;
  signal?: AbortSignal;
} = {}): Promise<Page<StockRow>> {
  const query = buildQuery({ q, category, limit, offset });
  return apiFetch<Page<StockRow>>(`/api/v1/reports/stock${query}`, { signal, cache: "no-store" });
}

/** Below the reorder point — only for medicines that set one. */
export function isLowStock(row: StockRow): boolean {
  return row.reorder_point !== null && row.available_quantity <= row.reorder_point;
}

/** Has a sellable lot inside the "expiring soon" window (same thresholds as the API). */
export function isExpiringSoon(row: StockRow): boolean {
  return row.risk_level === "critical" || row.risk_level === "high_risk";
}
