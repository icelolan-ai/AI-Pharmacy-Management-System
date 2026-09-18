import { apiFetch, buildQuery, type Page } from "@/lib/api/client";

export type LotStatus = "active" | "depleted" | "damaged" | "expired";

/** A lot as the API returns it. `sellable` and `days_remaining` are computed by
 *  the backend against business today (D9/D10) — the web never recomputes them. */
export type Lot = {
  id: string;
  medicine_id: string;
  medicine_name: string | null;
  lot_number: string;
  supplier_id: string | null;
  quantity_received: number;
  quantity_remaining: number;
  expiry_date: string;
  received_date: string;
  status: LotStatus | null;
  /** Raw value (D19) — pass through lib/format/expiry before showing it. */
  days_remaining: number;
  sellable: boolean;
  /** 🔒 owner / pharmacist only; absent for staff. */
  cost_per_unit?: string;
};

export type TransactionType =
  | "purchase"
  | "sale"
  | "adjustment"
  | "damage"
  | "expired"
  | "return"
  | "correction";

export type InventoryTransaction = {
  id: string;
  medicine_lot_id: string;
  transaction_type: TransactionType;
  quantity_change: number;
  quantity_before: number;
  quantity_after: number;
  reference_type: string | null;
  reference_id: string | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
};

export type AdjustmentResult = Lot & { transaction_id: string };

export function getLot(lotId: string, signal?: AbortSignal): Promise<Lot> {
  return apiFetch<Lot>(`/api/v1/lots/${lotId}`, { signal, cache: "no-store" });
}

export function listMedicineLots(
  medicineId: string,
  {
    includeInactive = true,
    limit = 200,
    offset = 0,
    signal,
  }: { includeInactive?: boolean; limit?: number; offset?: number; signal?: AbortSignal } = {},
): Promise<Page<Lot>> {
  const query = buildQuery({ include_inactive: includeInactive, limit, offset });
  return apiFetch<Page<Lot>>(`/api/v1/medicines/${medicineId}/lots${query}`, {
    signal,
    cache: "no-store",
  });
}

/** 🔒 owner / pharmacist only — staff gets 403. */
export function listLotTransactions(
  lotId: string,
  { limit = 20, offset = 0, signal }: { limit?: number; offset?: number; signal?: AbortSignal } = {},
): Promise<Page<InventoryTransaction>> {
  const query = buildQuery({ limit, offset });
  return apiFetch<Page<InventoryTransaction>>(`/api/v1/lots/${lotId}/transactions${query}`, {
    signal,
    cache: "no-store",
  });
}

// --- stock adjustment ---------------------------------------------------------------------

/** What the dialog collects. The screen asks for the counted quantity, never a
 *  difference — the conversion below is the only place that knows the API takes
 *  a difference (docs/05-web-spec.md 5.3). */
export type AdjustmentReason =
  | "damaged"
  | "stock_count"
  | "expired_removal"
  | "return_to_supplier"
  | "other";

export type AdjustStockFormValue = {
  /** The quantity that was just reloaded, shown on screen and sent as quantity_before. */
  currentQuantity: number;
  countedQuantity: number;
  reason: AdjustmentReason;
  note?: string;
};

/** Fixed mapping from docs/05-web-spec.md 5.3 — do not improvise. */
const REASON_TO_TRANSACTION_TYPE: Record<AdjustmentReason, TransactionType> = {
  damaged: "damage",
  stock_count: "correction",
  expired_removal: "expired",
  return_to_supplier: "return",
  other: "adjustment",
};

export const ADJUSTMENT_REASONS: { value: AdjustmentReason; label: string }[] = [
  { value: "damaged", label: "สินค้าชำรุด/แตกหัก" },
  { value: "stock_count", label: "นับสต็อกแล้วไม่ตรง" },
  { value: "expired_removal", label: "หมดอายุ — นำออกจากชั้น" },
  { value: "return_to_supplier", label: "คืนผู้จำหน่าย" },
  { value: "other", label: "อื่น ๆ" },
];

export function reasonLabel(reason: AdjustmentReason): string {
  return ADJUSTMENT_REASONS.find((entry) => entry.value === reason)?.label ?? reason;
}

export function transactionTypeFor(reason: AdjustmentReason): TransactionType {
  return REASON_TO_TRANSACTION_TYPE[reason];
}

/** These two only ever remove stock — the API rejects a positive change. */
export function reasonMustDecrease(reason: AdjustmentReason): boolean {
  const type = transactionTypeFor(reason);
  return type === "damage" || type === "expired";
}

export type AdjustmentRequest = {
  transaction_type: TransactionType;
  quantity_change: number;
  /** D23: what the screen showed, so a change made elsewhere is caught. */
  quantity_before: number;
  reason: string;
};

export function buildAdjustmentRequest(value: AdjustStockFormValue): AdjustmentRequest {
  const note = value.note?.trim();
  return {
    transaction_type: transactionTypeFor(value.reason),
    quantity_change: value.countedQuantity - value.currentQuantity,
    quantity_before: value.currentQuantity,
    reason: note ? `${reasonLabel(value.reason)} — ${note}` : reasonLabel(value.reason),
  };
}

export function adjustLot(lotId: string, value: AdjustStockFormValue): Promise<AdjustmentResult> {
  return apiFetch<AdjustmentResult>(`/api/v1/lots/${lotId}/adjustments`, {
    method: "POST",
    body: JSON.stringify(buildAdjustmentRequest(value)),
  });
}
