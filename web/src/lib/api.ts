import { supabase } from "@/lib/supabase";

export const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://127.0.0.1:8001";

/** Backend error shape (spec 8): {"error": {code, message, details}} */
type BackendError = {
  error?: { code?: string; message?: string; details?: unknown };
};

export class ApiError extends Error {
  readonly code: string;
  readonly status: number;
  readonly details: unknown;

  constructor(message: string, code: string, status: number, details?: unknown) {
    super(message);
    this.name = "ApiError";
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

const MESSAGE_BY_STATUS: Record<number, string> = {
  400: "ข้อมูลที่ส่งไปไม่ถูกต้อง",
  401: "กรุณาเข้าสู่ระบบ",
  403: "คุณไม่มีสิทธิ์ใช้งานส่วนนี้",
  404: "ไม่พบข้อมูลที่ต้องการ",
  409: "ทำรายการไม่ได้เพราะข้อมูลขัดแย้งกัน",
  500: "เกิดข้อผิดพลาดภายในระบบ",
  503: "ระบบไม่พร้อมใช้งานชั่วคราว กรุณาลองใหม่อีกครั้ง",
};

export const NETWORK_ERROR_MESSAGE =
  "เชื่อมต่อระบบไม่ได้ กรุณาตรวจสอบว่าเซิร์ฟเวอร์เปิดอยู่แล้วลองใหม่อีกครั้ง";

function redirectToLogin() {
  if (typeof window !== "undefined" && window.location.pathname !== "/login") {
    window.location.replace("/login");
  }
}

type ApiOptions = RequestInit & { auth?: boolean };

/** Calls the backend. Attaches the access token; never logs it. */
export async function apiFetch<T>(path: string, options: ApiOptions = {}): Promise<T> {
  const { auth = true, headers, ...init } = options;
  const requestHeaders = new Headers(headers);
  requestHeaders.set("Accept", "application/json");
  if (init.body && !requestHeaders.has("Content-Type")) {
    requestHeaders.set("Content-Type", "application/json");
  }

  if (auth) {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) {
      redirectToLogin();
      throw new ApiError("กรุณาเข้าสู่ระบบ", "UNAUTHENTICATED", 401);
    }
    requestHeaders.set("Authorization", `Bearer ${token}`);
  }

  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, { ...init, headers: requestHeaders });
  } catch {
    // Network/DNS/refused — the backend is probably not running.
    throw new ApiError(NETWORK_ERROR_MESSAGE, "NETWORK_ERROR", 0);
  }

  const raw = await response.text();
  let payload: unknown = null;
  if (raw) {
    try {
      payload = JSON.parse(raw);
    } catch {
      payload = null;
    }
  }

  if (!response.ok) {
    const backend = (payload as BackendError)?.error;
    if (response.status === 401) {
      redirectToLogin();
      throw new ApiError("กรุณาเข้าสู่ระบบ", backend?.code ?? "UNAUTHENTICATED", 401, backend?.details);
    }
    const message =
      response.status === 403
        ? backend?.message ?? MESSAGE_BY_STATUS[403]
        : backend?.message ?? MESSAGE_BY_STATUS[response.status] ?? "เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง";
    throw new ApiError(message, backend?.code ?? "HTTP_ERROR", response.status, backend?.details);
  }

  return payload as T;
}

export type HealthStatus = { status: string; database: string };

/** /health needs no login. */
export function fetchHealth(): Promise<HealthStatus> {
  return apiFetch<HealthStatus>("/health", { auth: false, cache: "no-store" });
}

export type Me = {
  id: string;
  email: string | null;
  full_name: string | null;
  role: string;
};

export function fetchMe(): Promise<Me> {
  return apiFetch<Me>("/api/v1/me", { cache: "no-store" });
}
