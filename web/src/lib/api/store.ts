import { apiFetch } from "@/lib/api/client";

/** ข้อมูลร้าน. Every field is nullable: before the first save the shop has no
 *  profile yet and the API answers 200 with nulls (never 404). */
export type StoreProfile = {
  id: string | null;
  name: string | null;
  address: string | null;
  phone: string | null;
  license_no: string | null;
  tax_id: string | null;
  updated_at: string | null;
  updated_by: string | null;
  updated_by_name: string | null;
};

/** Only fields the API accepts; unknown fields are rejected with 400.
 *  `name` may be changed but never cleared. */
export type StoreProfilePayload = {
  name?: string;
  address?: string | null;
  phone?: string | null;
  license_no?: string | null;
  tax_id?: string | null;
};

export function getStoreProfile(signal?: AbortSignal): Promise<StoreProfile> {
  return apiFetch<StoreProfile>("/api/v1/store", { signal, cache: "no-store" });
}

/** Owner only — the backend answers 403 for anyone else. */
export function updateStoreProfile(payload: StoreProfilePayload): Promise<StoreProfile> {
  return apiFetch<StoreProfile>("/api/v1/store", {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

/** True while the shop has not filled the form in yet (D21). */
export function isStoreProfileEmpty(profile: StoreProfile | null): boolean {
  return !profile || !profile.name;
}
