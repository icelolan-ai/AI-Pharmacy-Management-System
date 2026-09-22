"use client";

import { useState } from "react";

import { ErrorState } from "@/components/common/ErrorState";
import { QtyText } from "@/components/common/QtyText";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ApiError } from "@/lib/api/client";
import {
  ADJUSTMENT_REASONS,
  adjustLot,
  getLot,
  reasonMustDecrease,
  type AdjustmentReason,
  type Lot,
} from "@/lib/api/lots";
import { isValidOptionalInteger, parseOptionalInteger } from "@/lib/format/number";

const STALE_MESSAGE = "จำนวนคงเหลือเปลี่ยนไประหว่างที่เปิดหน้าต่างนี้ กรุณาตรวจนับใหม่";

/** Adjust one lot's stock.
 *
 *  The screen asks for the counted quantity, never a difference — lib/api/lots.ts
 *  converts. `lot` must be freshly reloaded by the caller before this opens, and
 *  its quantity is sent as `quantity_before` so a sale made in another window is
 *  caught by the backend instead of silently overwritten (D23).
 */
export function AdjustStockDialog({
  open,
  onOpenChange,
  lot,
  unit,
  onAdjusted,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  lot: Lot | null;
  unit: string;
  onAdjusted: () => void;
}) {
  // Mounted only while open (see the callers), so these initial values ARE the
  // reset. Nothing resets them again afterwards — a 409 must leave every typed
  // field exactly as it was (D23).
  const [current, setCurrent] = useState(lot?.quantity_remaining ?? 0);
  const [counted, setCounted] = useState(String(lot?.quantity_remaining ?? ""));
  const [reason, setReason] = useState<AdjustmentReason | null>(null);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);


  const countedValue = parseOptionalInteger(counted);
  const countedValid = isValidOptionalInteger(counted) && countedValue !== null && countedValue >= 0;
  const difference = countedValid ? countedValue - current : 0;

  const noteRequired = reason === "other";
  const wrongDirection = reason !== null && reasonMustDecrease(reason) && difference > 0;

  let blockedMessage: string | null = null;
  if (!countedValid) blockedMessage = "กรุณากรอกจำนวนที่นับได้จริงเป็นจำนวนเต็มไม่ติดลบ";
  else if (difference === 0) blockedMessage = "จำนวนไม่เปลี่ยนแปลง ไม่ต้องบันทึก";
  else if (current + difference < 0) blockedMessage = "ผลลัพธ์ติดลบไม่ได้ กรุณาตรวจนับใหม่";
  else if (wrongDirection) {
    blockedMessage = "เหตุผลนี้ใช้ได้เฉพาะกรณีจำนวนลดลง";
  }

  const canSubmit =
    !saving && blockedMessage === null && reason !== null && (!noteRequired || note.trim() !== "");

  /** Pull the lot again without closing, so the user keeps what they typed. */
  async function refreshCurrent() {
    if (!lot) return;
    try {
      const fresh = await getLot(lot.id);
      setCurrent(fresh.quantity_remaining);
    } catch {
      // Keep the dialog usable; the next save will report the real problem.
    }
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!lot || !canSubmit || reason === null || countedValue === null) return;

    setSaving(true);
    setError(null);
    try {
      await adjustLot(lot.id, {
        currentQuantity: current,
        countedQuantity: countedValue,
        reason,
        note: note.trim() || undefined,
      });
      onAdjusted();
      onOpenChange(false);
    } catch (submitError) {
      if (submitError instanceof ApiError && submitError.status === 409) {
        // D23: someone changed this lot while the dialog was open. Stay open,
        // keep every field, and show the fresh number to count against.
        setError(STALE_MESSAGE);
        await refreshCurrent();
      } else {
        setError(
          submitError instanceof ApiError ? submitError.message : "บันทึกไม่สำเร็จ กรุณาลองใหม่อีกครั้ง",
        );
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>ปรับจำนวนสต็อก</DialogTitle>
          <DialogDescription>
            {lot ? `ล็อต ${lot.lot_number}` : ""}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-3" noValidate>
          <div className="flex items-center justify-between rounded-md bg-slate-50 px-3 py-2">
            <span className="text-sm text-slate-600">จำนวนในระบบตอนนี้</span>
            <QtyText value={current} unit={unit} className="font-medium" />
          </div>

          <div>
            <Label htmlFor="counted">จำนวนที่นับได้จริง *</Label>
            <div className="flex items-center gap-2">
              <Input
                id="counted"
                inputMode="numeric"
                value={counted}
                onChange={(event) => setCounted(event.target.value)}
                disabled={saving}
                aria-invalid={!countedValid}
                className="max-w-32"
              />
              <span className="text-sm text-slate-500">{unit}</span>
            </div>
          </div>

          <div className="flex items-center justify-between rounded-md border border-slate-200 px-3 py-2">
            <span className="text-sm text-slate-600">ผลต่าง</span>
            <span className="text-sm font-medium tabular-nums">
              {!countedValid || difference === 0 ? (
                <span className="text-slate-400">—</span>
              ) : (
                <span className={difference < 0 ? "text-red-600" : "text-green-700"}>
                  {difference > 0 ? "+" : "−"}
                  {Math.abs(difference)} {unit} ({difference < 0 ? "ลดลง" : "เพิ่มขึ้น"})
                </span>
              )}
            </span>
          </div>

          <fieldset disabled={saving}>
            <legend className="text-sm font-medium text-slate-900">เหตุผล *</legend>
            <div className="mt-1 space-y-1">
              {ADJUSTMENT_REASONS.map((entry) => (
                <label key={entry.value} className="flex items-center gap-2 text-sm">
                  <input
                    type="radio"
                    name="adjust-reason"
                    value={entry.value}
                    checked={reason === entry.value}
                    onChange={() => setReason(entry.value)}
                  />
                  {entry.label}
                </label>
              ))}
            </div>
          </fieldset>

          <div>
            <Label htmlFor="adjust-note">
              รายละเอียดเพิ่มเติม{noteRequired ? " *" : ""}
            </Label>
            <Textarea
              id="adjust-note"
              value={note}
              onChange={(event) => setNote(event.target.value)}
              disabled={saving}
              rows={2}
              maxLength={400}
            />
            {noteRequired && note.trim() === "" ? (
              <p className="mt-1 text-xs text-red-600">เลือก “อื่น ๆ” ต้องกรอกรายละเอียด</p>
            ) : null}
          </div>

          {blockedMessage && countedValid ? (
            <p className="text-xs text-amber-700">{blockedMessage}</p>
          ) : null}

          <p className="rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800">
            ⚠️ การปรับนี้จะถูกบันทึกในชื่อผู้ใช้ปัจจุบันและตรวจสอบย้อนหลังได้ ยกเลิกไม่ได้
          </p>

          {error ? <ErrorState message={error} /> : null}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={saving}
            >
              ยกเลิก
            </Button>
            <Button type="submit" disabled={!canSubmit}>
              {saving ? "กำลังบันทึก..." : "บันทึกการปรับ"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
