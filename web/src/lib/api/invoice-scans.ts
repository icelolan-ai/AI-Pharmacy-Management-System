import {
  API_BASE_URL,
  ApiError,
  apiFetch,
  clearSessionAndRedirect,
  MESSAGE_BY_STATUS,
  NETWORK_ERROR_MESSAGE,
} from "@/lib/api/client";
import type { DeviceResizeSettings } from "@/lib/scan/device-resize";
import { supabase } from "@/lib/supabase";

/** ถ่ายรูปใบส่งของ (6.2).
 *
 *  Photos go to the backend and nowhere else. The backend shrinks them,
 *  stores them in a private bucket and answers with short-lived signed links;
 *  the browser never talks to Storage and never holds a key for it.
 */

export type ScanPage = {
  page_no: number;
  /** Signed and short-lived; ask again rather than keeping it. */
  image_url: string;
  width_px: number;
  height_px: number;
  bytes: number;
  reencoded: boolean;
  source_content_type: string;
  source_bytes: number;
  source_width_px: number;
  source_height_px: number;
  uploaded_at: string;
};

export type Scan = {
  id: string;
  status: string;
  created_at: string;
  created_by: string | null;
  created_by_name: string | null;
  pages: ScanPage[];
  url_expires_in_seconds: number;
  /** D75: what to shrink to before sending — the backend's own settings. */
  device_resize: DeviceResizeSettings;
};

export type UploadedPage = {
  page_no: number;
  width_px: number;
  height_px: number;
  bytes: number;
  reencoded: boolean;
  source_bytes: number;
};

export function createScan(): Promise<Scan> {
  return apiFetch<Scan>("/api/v1/invoice-scans", { method: "POST" });
}

export function deleteScanPage(scanId: string, pageNo: number): Promise<void> {
  return apiFetch<void>(`/api/v1/invoice-scans/${scanId}/pages/${pageNo}`, { method: "DELETE" });
}

/** Sends one photo as the request body. `onProgress` gets 0..1 as the bytes
 *  leave the phone — XMLHttpRequest, because fetch cannot report that, and a
 *  large photo on a slow connection needs to show it is moving. `onSent`
 *  fires when the last byte has left, so sending and the server's work can
 *  be timed apart (D72). `resizedOnDevice` is passed on as the phone's word
 *  (D75); the backend records it and checks nothing against it (D69). */
export async function uploadScanPage(
  scanId: string,
  file: Blob,
  options: { resizedOnDevice: boolean; onProgress: (fraction: number) => void; onSent?: () => void },
): Promise<UploadedPage> {
  const { resizedOnDevice, onProgress, onSent } = options;
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) {
    await clearSessionAndRedirect();
    throw new ApiError("กรุณาเข้าสู่ระบบ", "UNAUTHENTICATED", 401);
  }

  const result = await new Promise<{ status: number; body: string }>((resolve, reject) => {
    const request = new XMLHttpRequest();
    const query = resizedOnDevice ? "?resized_on_device=true" : "";
    request.open("POST", `${API_BASE_URL}/api/v1/invoice-scans/${scanId}/pages${query}`);
    request.setRequestHeader("Authorization", `Bearer ${token}`);
    request.setRequestHeader("Accept", "application/json");
    // The label is only logged; the backend decides from the bytes.
    request.setRequestHeader("Content-Type", file.type || "application/octet-stream");
    request.upload.onprogress = (event) => {
      if (event.lengthComputable && event.total > 0) onProgress(event.loaded / event.total);
    };
    request.upload.onload = () => onSent?.();
    request.onload = () => resolve({ status: request.status, body: request.responseText });
    request.onerror = () => reject(new ApiError(NETWORK_ERROR_MESSAGE, "NETWORK_ERROR", 0));
    request.send(file);
  });

  let payload: unknown = null;
  try {
    payload = result.body ? JSON.parse(result.body) : null;
  } catch {
    payload = null;
  }
  if (result.status >= 200 && result.status < 300) return payload as UploadedPage;

  const backend = (payload as { error?: { code?: string; message?: string; details?: unknown } })?.error;
  if (result.status === 401) {
    await clearSessionAndRedirect();
    throw new ApiError("กรุณาเข้าสู่ระบบ", backend?.code ?? "UNAUTHENTICATED", 401);
  }
  throw new ApiError(
    backend?.message ?? MESSAGE_BY_STATUS[result.status] ?? "ส่งรูปไม่สำเร็จ ลองใหม่อีกครั้ง",
    backend?.code ?? "HTTP_ERROR",
    result.status,
    backend?.details,
  );
}

/** One row of GET /invoice-scans (owner and pharmacist only). */
export type ScanListItem = {
  id: string;
  status: string;
  created_at: string;
  created_by: string | null;
  created_by_name: string | null;
  page_count: number;
};

export function listScans(signal?: AbortSignal): Promise<ScanListItem[]> {
  return apiFetch<ScanListItem[]>("/api/v1/invoice-scans", { signal, cache: "no-store" });
}

/** 6.3/6.4: what the reading came to. The AI's copy (`ai`) and what our
 *  backend made of it (`derived`) — docs/06-ai-design.md 2.4. Kept loose on
 *  purpose: the page reads it, never writes it. */
export type AiField = { state: "read" | "absent" | "unreadable"; text: string | null; confidence: number | null };
export type DecidedDate = {
  text: string | null;
  state: string;
  value: string | null;
  ambiguous: boolean;
  candidates: string[];
  how: string;
  day_filled_by_system: boolean;
  suggested?: string | null;
};
export type Flag = { field: string; why: string };
export type DerivedLine = {
  line_no: number;
  page_no: number;
  name: string | null;
  name_from_line: number | null;
  free_goods: boolean;
  quantity: number | null;
  unit: string | null;
  unit_price_satang: number | null;
  line_discount_satang: number | null;
  amount_satang: number | null;
  lot: string | null;
  lot_state: string;
  mfg: DecidedDate;
  exp: DecidedDate;
  flags: Flag[];
};
export type TotalCheck = {
  rule: string;
  ok: boolean;
  expected_satang: number;
  printed_satang: number;
  line_no?: number;
};
export type Extracted = {
  schema_version: number;
  ai: {
    doc_kind: string;
    supplier_name: AiField;
    supplier_tax_id: AiField;
    invoice_no: AiField;
    doc_date: AiField;
    due_date?: AiField;
    lines: Array<{ line_no: number; page_no: number; name: AiField; [field: string]: unknown }>;
    totals: { page_no: number | null; boxes: Array<{ label: string; amount: AiField }> };
  };
  derived: {
    doc_date: DecidedDate;
    due_date?: DecidedDate;
    header_flags: Flag[];
    lines: DerivedLine[];
    totals: { roles: Record<string, number>; unknown_labels: string[]; flags: Array<{ box: number; why: string }> };
    checks: TotalCheck[];
    warnings: Array<{ why: string; page_no?: number }>;
    must_check: string[];
  };
};

export type Correction = {
  field_path: string;
  shown_value: string | null;
  person_value: string | null;
  action: "confirmed" | "changed";
  changed_at: string;
  changed_by_name: string | null;
};

export type ScanDetail = Scan & {
  failed_reason: string | null;
  doc_kind: string | null;
  extracted: Extracted | null;
  /** Who read it. "stand-in" = a test invoice not read by AI (backend app/ai/stand_in.py). */
  provider: string | null;
  /** 6.4: the latest touch of every field; the AI's answer is never changed. */
  corrections: Correction[];
  /** Fields a person must still touch before going on (D57 · D85 · D87). */
  untouched: string[];
  reviewed_at: string | null;
  reviewed_by_name: string | null;
  rejected_reason: string | null;
  rejected_at: string | null;
};

/** 6.4: one touch of one field — a new row each time, never an edit. */
export function touchField(
  scanId: string,
  body: { field_path: string; action: "confirmed" | "changed"; person_value?: string | null },
): Promise<Correction & { untouched: string[] }> {
  return apiFetch(`/api/v1/invoice-scans/${scanId}/fields`, { method: "POST", body: JSON.stringify(body) });
}

export function reviewDone(scanId: string): Promise<{ id: string; status: string; reviewed_at: string }> {
  return apiFetch(`/api/v1/invoice-scans/${scanId}/review-done`, { method: "POST" });
}

export function rejectScan(scanId: string, reason: string): Promise<{ id: string; status: string }> {
  return apiFetch(`/api/v1/invoice-scans/${scanId}/reject`, { method: "POST", body: JSON.stringify({ reason }) });
}

export function getScan(scanId: string, signal?: AbortSignal): Promise<ScanDetail> {
  return apiFetch<ScanDetail>(`/api/v1/invoice-scans/${scanId}`, { signal, cache: "no-store" });
}

export type ExtractResult = { id: string; status: string; failed_reason: string | null };

/** Reads the scan with AI. Ends needs_review or failed — both are answers. */
export function extractScan(scanId: string): Promise<ExtractResult> {
  return apiFetch<ExtractResult>(`/api/v1/invoice-scans/${scanId}/extract`, { method: "POST" });
}

export function deleteScan(scanId: string): Promise<{ id: string; page_count: number; files_removed: boolean }> {
  return apiFetch(`/api/v1/invoice-scans/${scanId}`, { method: "DELETE" });
}
