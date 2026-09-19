"use client";

import { Button } from "@/components/ui/button";
import type { SaveState } from "@/lib/hooks/use-purchase-draft";
import { formatClockTime } from "@/lib/format/date";

const LABEL: Record<SaveState, string> = {
  idle: "",
  pending: "กำลังรอบันทึก...",
  saving: "กำลังบันทึกร่าง...",
  saved: "💾 บันทึกร่างแล้ว",
  error: "บันทึกร่างไม่สำเร็จ",
};

/** Tells the shop what has and has not been written down yet. */
export function DraftStatus({
  state,
  savedAt,
  error,
  onRetry,
}: {
  state: SaveState;
  savedAt: number | null;
  error: string | null;
  onRetry: () => void;
}) {
  if (state === "idle") return null;

  if (state === "error") {
    return (
      <p className="flex flex-wrap items-center gap-2 text-xs text-red-600" role="status">
        {error ?? LABEL.error}
        <Button type="button" variant="outline" size="sm" onClick={onRetry}>
          ลองใหม่
        </Button>
      </p>
    );
  }

  return (
    <p className="text-xs text-slate-500" role="status">
      {LABEL[state]}
      {state === "saved" && savedAt !== null ? ` เมื่อ ${formatClockTime(savedAt)} น.` : ""}
    </p>
  );
}

/** Offered when a draft from an earlier session is still open. */
export function UnfinishedDraftBanner({
  supplierName,
  onContinue,
  onDiscard,
  busy,
}: {
  supplierName: string | null;
  onContinue: () => void;
  onDiscard: () => void;
  busy: boolean;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-sky-200 bg-sky-50 px-4 py-3">
      <p className="text-sm text-sky-900">
        มีใบรับสินค้าที่ค้างไว้{supplierName ? ` จาก ${supplierName}` : ""}
      </p>
      <div className="flex gap-2">
        <Button type="button" size="sm" onClick={onContinue} disabled={busy}>
          ทำต่อ
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={onDiscard} disabled={busy}>
          ทิ้งร่าง
        </Button>
      </div>
    </div>
  );
}
