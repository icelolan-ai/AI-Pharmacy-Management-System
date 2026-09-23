import { apiFetch, buildQuery, type Page } from "@/lib/api/client";

export type PurchaseStatus = "draft" | "confirmed" | "discrepancy";

/** Field names follow docs/03-api-openapi.json, not the prose spec (D24). */
export type PurchaseItem = {
  id: string;
  medicine_id: string;
  medicine_name: string | null;
  /** The medicine's unit, carried on the line so reopening a draft still says
   *  what is being counted. Null only if the medicine row has gone. */
  unit: string | null;
  quantity_invoiced: number;
  quantity_actual: number | null;
  unit_cost: string;
  lot_number: string;
  expiry_date: string;
  /** The API calls it subtotal, not line_total. */
  subtotal: string;
};

export type PurchaseLot = {
  id: string;
  purchase_item_id: string | null;
  medicine_id: string;
  lot_number: string;
  quantity_received: number;
  quantity_remaining: number;
  cost_per_unit: string;
  expiry_date: string;
  received_date: string;
  status: string | null;
};

export type Purchase = {
  id: string;
  /** D29 — null while still a draft. */
  purchase_no: string | null;
  /** D28 — compulsory at confirm time. */
  invoice_no: string | null;
  supplier_id: string;
  supplier_name: string | null;
  purchase_date: string;
  /** The API calls it items_subtotal, not subtotal. */
  items_subtotal: string;
  discount_amount: string;
  tax_amount: string;
  total_amount: string;
  status: PurchaseStatus;
  created_by: string | null;
  /** D30 — from purchases.created_by, never the reader. */
  created_by_name: string | null;
  created_at: string;
  /** D30 — when the goods were counted in; the A4 note prints this. */
  confirmed_at: string | null;
  items: PurchaseItem[];
  lots: PurchaseLot[];
};

export type PurchaseSummary = {
  id: string;
  purchase_no: string | null;
  invoice_no: string | null;
  supplier_id: string;
  supplier_name: string | null;
  purchase_date: string;
  total_amount: string;
  status: PurchaseStatus;
  item_count: number;
  created_at: string;
};

export type PurchaseItemInput = {
  medicine_id: string;
  quantity_invoiced: number;
  quantity_actual?: number | null;
  unit_cost: string;
  lot_number: string;
  /** ISO date from monthYearBEToISO() — the last day of the month (D16). */
  expiry_date: string;
};

export type PurchaseInput = {
  supplier_id: string;
  purchase_date: string;
  invoice_no?: string | null;
  discount_amount: string;
  tax_amount: string;
  items: PurchaseItemInput[];
  // Never send subtotal or total_amount — the backend works them out.
};

export type ConfirmResult = {
  purchase_id: string;
  purchase_no: string;
  status: "confirmed" | "discrepancy";
  confirmed_at: string;
  lots: { id: string; medicine_id: string; lot_number: string; quantity: number; expiry_date: string }[];
  discrepancies: { medicine_id: string; lot_number: string; invoiced: number; actual: number }[];
};

export function listPurchases({
  status,
  supplierId,
  dateFrom,
  dateTo,
  limit = 50,
  offset = 0,
  signal,
}: {
  status?: PurchaseStatus;
  supplierId?: string | null;
  dateFrom?: string | null;
  dateTo?: string | null;
  limit?: number;
  offset?: number;
  signal?: AbortSignal;
} = {}): Promise<Page<PurchaseSummary>> {
  const query = buildQuery({
    status,
    supplier_id: supplierId,
    date_from: dateFrom,
    date_to: dateTo,
    limit,
    offset,
  });
  return apiFetch<Page<PurchaseSummary>>(`/api/v1/purchases${query}`, { signal, cache: "no-store" });
}

export function getPurchase(id: string, signal?: AbortSignal): Promise<Purchase> {
  return apiFetch<Purchase>(`/api/v1/purchases/${id}`, { signal, cache: "no-store" });
}

export function createPurchase(input: PurchaseInput): Promise<Purchase> {
  return apiFetch<Purchase>("/api/v1/purchases", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

/** PUT replaces the header and every item of a draft. */
export function updatePurchase(id: string, input: PurchaseInput): Promise<Purchase> {
  return apiFetch<Purchase>(`/api/v1/purchases/${id}`, {
    method: "PUT",
    body: JSON.stringify(input),
  });
}

export function deletePurchase(id: string): Promise<{ id: string; deleted: boolean }> {
  return apiFetch<{ id: string; deleted: boolean }>(`/api/v1/purchases/${id}`, {
    method: "DELETE",
  });
}

export function confirmPurchase(id: string): Promise<ConfirmResult> {
  return apiFetch<ConfirmResult>(`/api/v1/purchases/${id}/confirm`, { method: "POST" });
}

/** B-4: the mismatch flag is the status itself — there is no
 *  has_quantity_mismatch field and none should be invented. */
export function hasMismatch(purchase: { status: PurchaseStatus }): boolean {
  return purchase.status === "discrepancy";
}

export function itemHasMismatch(item: {
  quantity_invoiced: number;
  quantity_actual: number | null;
}): boolean {
  return item.quantity_actual !== null && item.quantity_invoiced !== item.quantity_actual;
}

/** How many actually came in, by the rule the API documents (03-api-spec.md
 *  §411): the counted quantity when one was entered, otherwise the quantity on
 *  the delivery note. A null does NOT mean "nobody counted" — it means the
 *  line was taken as invoiced, and that is what the shop was charged for. */
export function receivedQuantity(item: {
  quantity_invoiced: number;
  quantity_actual: number | null;
}): number {
  return item.quantity_actual ?? item.quantity_invoiced;
}

/** Positive = more arrived than the note said, negative = short. */
export function itemDifference(item: {
  quantity_invoiced: number;
  quantity_actual: number | null;
}): number {
  return receivedQuantity(item) - item.quantity_invoiced;
}
