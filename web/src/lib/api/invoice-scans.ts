import {
  API_BASE_URL,
  ApiError,
  apiFetch,
  clearSessionAndRedirect,
  MESSAGE_BY_STATUS,
  NETWORK_ERROR_MESSAGE,
} from "@/lib/api/client";
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
 *  large photo on a slow connection needs to show it is moving. */
export async function uploadScanPage(
  scanId: string,
  file: Blob,
  onProgress: (fraction: number) => void,
): Promise<UploadedPage> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) {
    await clearSessionAndRedirect();
    throw new ApiError("กรุณาเข้าสู่ระบบ", "UNAUTHENTICATED", 401);
  }

  const result = await new Promise<{ status: number; body: string }>((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open("POST", `${API_BASE_URL}/api/v1/invoice-scans/${scanId}/pages`);
    request.setRequestHeader("Authorization", `Bearer ${token}`);
    request.setRequestHeader("Accept", "application/json");
    // The label is only logged; the backend decides from the bytes.
    request.setRequestHeader("Content-Type", file.type || "application/octet-stream");
    request.upload.onprogress = (event) => {
      if (event.lengthComputable && event.total > 0) onProgress(event.loaded / event.total);
    };
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
