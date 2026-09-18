import { apiFetch, buildQuery, type Page } from "@/lib/api/client";
import { looksLikeBarcode } from "@/lib/format/number";

/** Fields exactly as the backend returns them (docs/03-api-openapi.json).
 *  Money is a decimal string; staff responses omit cost fields entirely. */
export type Medicine = {
  id: string;
  name: string;
  generic_name: string | null;
  strength: string | null;
  dosage_form: string | null;
  manufacturer: string | null;
  category: string | null;
  barcode: string | null;
  active_ingredient: string | null;
  reorder_point: number | null;
  selling_price: string | null;
  is_active: boolean;
  available_quantity: number;
  created_at: string;
  updated_at: string;
};

export type MedicineListParams = {
  q?: string | null;
  category?: string | null;
  isActive?: boolean;
  limit?: number;
  offset?: number;
  signal?: AbortSignal;
};

export function listMedicines({
  q,
  category,
  isActive,
  limit = 50,
  offset = 0,
  signal,
}: MedicineListParams = {}): Promise<Page<Medicine>> {
  const query = buildQuery({ q, category, is_active: isActive, limit, offset });
  return apiFetch<Page<Medicine>>(`/api/v1/medicines${query}`, { signal, cache: "no-store" });
}

export function getMedicine(id: string, signal?: AbortSignal): Promise<Medicine> {
  return apiFetch<Medicine>(`/api/v1/medicines/${id}`, { signal, cache: "no-store" });
}

export function getMedicineByBarcode(barcode: string, signal?: AbortSignal): Promise<Medicine> {
  return apiFetch<Medicine>(`/api/v1/medicines/by-barcode/${encodeURIComponent(barcode)}`, {
    signal,
    cache: "no-store",
  });
}

/** Digits-only input of 8+ characters is treated as a barcode first, then falls
 *  back to the normal ?q= search when no medicine carries that barcode. */
export async function searchMedicines(params: MedicineListParams = {}): Promise<Page<Medicine>> {
  const term = (params.q ?? "").trim();
  if (looksLikeBarcode(term)) {
    try {
      const medicine = await getMedicineByBarcode(term, params.signal);
      return { items: [medicine], total: 1, limit: params.limit ?? 50, offset: 0 };
    } catch {
      // Not found (or not a barcode after all) — fall through to the text search.
    }
  }
  return listMedicines(params);
}

/** Only fields the API accepts; unknown fields are rejected with 400. */
export type MedicinePayload = {
  name: string;
  generic_name?: string | null;
  strength?: string | null;
  dosage_form?: string | null;
  manufacturer?: string | null;
  category?: string | null;
  barcode?: string | null;
  active_ingredient?: string | null;
  reorder_point?: number | null;
  selling_price?: string | null;
};

export function createMedicine(payload: MedicinePayload): Promise<Medicine> {
  return apiFetch<Medicine>("/api/v1/medicines", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function updateMedicine(
  id: string,
  payload: Partial<MedicinePayload> & { is_active?: boolean },
): Promise<Medicine> {
  return apiFetch<Medicine>(`/api/v1/medicines/${id}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}
