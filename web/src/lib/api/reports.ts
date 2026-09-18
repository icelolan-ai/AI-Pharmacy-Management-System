import { apiFetch, buildQuery, type Page } from "@/lib/api/client";
import { sumMoney } from "@/lib/format/money";

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

// --- expiring / expired / low stock / inventory value ----------------------------------

export type ExpiringRow = {
  lot_id: string;
  medicine_id: string;
  medicine_name: string;
  unit: string;
  lot_number: string;
  quantity_remaining: number;
  expiry_date: string;
  /** Raw value (D19) — pass through lib/format/expiry before showing it. */
  days_remaining: number;
  risk_level: RiskLevel;
  stock_value?: string;
};

export type RiskSummary = { lot_count: number; stock_value?: string };

export type ExpiringReport = Page<ExpiringRow> & {
  summary: Record<RiskLevel, RiskSummary>;
};

/** Order the dashboard and the tabs use — worst first. */
export const RISK_ORDER: RiskLevel[] = ["critical", "high_risk", "warning", "normal"];

export const RISK_LABEL: Record<RiskLevel, string> = {
  critical: "วิกฤต (ไม่เกิน 30 วัน)",
  high_risk: "เสี่ยงสูง (31–90 วัน)",
  warning: "เฝ้าระวัง (91–180 วัน)",
  normal: "ปกติ (เกิน 180 วัน)",
};

export function listExpiringReport({
  days = 180,
  limit = 200,
  offset = 0,
  signal,
}: { days?: number; limit?: number; offset?: number; signal?: AbortSignal } = {}): Promise<ExpiringReport> {
  const query = buildQuery({ days, limit, offset });
  return apiFetch<ExpiringReport>(`/api/v1/reports/expiring${query}`, { signal, cache: "no-store" });
}

export type ExpiredRow = {
  lot_id: string;
  medicine_id: string;
  medicine_name: string;
  lot_number: string;
  quantity_remaining: number;
  expiry_date: string;
  days_expired: number;
  stock_value?: string;
};

export function listExpiredReport({
  limit = 200,
  offset = 0,
  signal,
}: { limit?: number; offset?: number; signal?: AbortSignal } = {}): Promise<Page<ExpiredRow>> {
  const query = buildQuery({ limit, offset });
  return apiFetch<Page<ExpiredRow>>(`/api/v1/reports/expired${query}`, { signal, cache: "no-store" });
}

export type LowStockRow = {
  medicine_id: string;
  name: string;
  available_quantity: number;
  reorder_point: number;
  shortage: number;
};

export function listLowStockReport({
  limit = 200,
  offset = 0,
  signal,
}: { limit?: number; offset?: number; signal?: AbortSignal } = {}): Promise<Page<LowStockRow>> {
  const query = buildQuery({ limit, offset });
  return apiFetch<Page<LowStockRow>>(`/api/v1/reports/low-stock${query}`, { signal, cache: "no-store" });
}

export type MedicineValue = {
  medicine_id: string;
  name: string;
  total_value: string;
  sellable_value: string;
  expired_value: string;
};

export type CategoryValue = {
  category: string;
  total_value: string;
  sellable_value: string;
  expired_value: string;
};

export type InventoryValueReport = {
  total_value: string;
  sellable_value: string;
  expired_value: string;
  by_medicine: Page<MedicineValue>;
  by_category: CategoryValue[];
};

/** 🔒 owner only — the backend answers 403 for anyone else (D20). */
export function getInventoryValue({
  limit = 200,
  offset = 0,
  signal,
}: { limit?: number; offset?: number; signal?: AbortSignal } = {}): Promise<InventoryValueReport> {
  const query = buildQuery({ limit, offset });
  return apiFetch<InventoryValueReport>(`/api/v1/reports/inventory-value${query}`, {
    signal,
    cache: "no-store",
  });
}

/** "เงินจมในยาใกล้หมดอายุ": the value of stock that is still sellable but
 *  inside the 180-day window. The API has no such field — it is the sum of the
 *  expiring summary. `expired_value` is NOT this: that stock is already dead. */
export function nearExpiryValue(summary: ExpiringReport["summary"]): string {
  return sumMoney(RISK_ORDER.map((risk) => summary[risk]?.stock_value));
}

export function totalLotCount(summary: ExpiringReport["summary"]): number {
  return RISK_ORDER.reduce((total, risk) => total + (summary[risk]?.lot_count ?? 0), 0);
}
