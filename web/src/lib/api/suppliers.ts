import { apiFetch, buildQuery, type Page } from "@/lib/api/client";

export type Supplier = {
  id: string;
  name: string;
  contact_person: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  lead_time_days: number | null;
  created_at: string;
  updated_at: string;
};

export type SupplierListParams = {
  q?: string | null;
  limit?: number;
  offset?: number;
  signal?: AbortSignal;
};

export function listSuppliers({
  q,
  limit = 50,
  offset = 0,
  signal,
}: SupplierListParams = {}): Promise<Page<Supplier>> {
  return apiFetch<Page<Supplier>>(`/api/v1/suppliers${buildQuery({ q, limit, offset })}`, {
    signal,
    cache: "no-store",
  });
}

export function getSupplier(id: string, signal?: AbortSignal): Promise<Supplier> {
  return apiFetch<Supplier>(`/api/v1/suppliers/${id}`, { signal, cache: "no-store" });
}

export type SupplierPayload = {
  name: string;
  contact_person?: string | null;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  lead_time_days?: number | null;
};

export function createSupplier(payload: SupplierPayload): Promise<Supplier> {
  return apiFetch<Supplier>("/api/v1/suppliers", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function updateSupplier(id: string, payload: Partial<SupplierPayload>): Promise<Supplier> {
  return apiFetch<Supplier>(`/api/v1/suppliers/${id}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}
