"use client";

import { useEffect, useState } from "react";

import { ErrorState } from "@/components/common/ErrorState";
import { MoneyText } from "@/components/common/MoneyText";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { CartItem } from "@/lib/hooks/use-sell-cart";
import { describeExpiry } from "@/lib/format/expiry";

/** How long the confirm button stays dead, so a held Enter cannot sail through. */
const ARM_DELAY_MS = 300;

/** Lots inside this many days get called out before the sale is taken. */
const WARN_WITHIN_DAYS = 89;

export function ConfirmSaleDialog({
  open,
  onOpenChange,
  items,
  estimatedTotal,
  canSeePrice,
  saving,
  slow,
  error,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  items: CartItem[];
  estimatedTotal: string;
  canSeePrice: boolean;
  saving: boolean;
  slow: boolean;
  error: string | null;
  onConfirm: () => void;
}) {
  // Mounted only while open (see the caller), so the delay restarts on every
  // opening and a held Enter cannot carry through from the last one.
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setArmed(true), ARM_DELAY_MS);
    return () => clearTimeout(timer);
  }, []);

  // Every lot the sale would cut that is close to its last sellable day.
  const warnings = items.flatMap((item) =>
    (item.preview?.allocations ?? [])
      .map((allocation) => ({ allocation, expiry: describeExpiry(allocation.expiry_date) }))
      .filter((entry) => entry.expiry.days <= WARN_WITHIN_DAYS)
      .map((entry) => ({ name: item.medicine.name, ...entry })),
  );

  const totalUnits = items.reduce((total, item) => total + item.quantity, 0);

  return (
    <Dialog open={open} onOpenChange={saving ? () => {} : onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>ยืนยันการขาย</DialogTitle>
          <DialogDescription>
            {items.length} รายการ · {totalUnits} ชิ้นรวม
          </DialogDescription>
        </DialogHeader>

        <ul className="max-h-56 space-y-1 overflow-y-auto text-sm">
          {items.map((item) => (
            <li key={item.key} className="flex justify-between gap-3">
              <span className="min-w-0 truncate text-slate-700">
                {item.medicine.name} × {item.quantity} {item.medicine.unit}
              </span>
              {canSeePrice ? (
                <MoneyText value={item.medicine.selling_price} className="shrink-0 text-slate-600" />
              ) : null}
            </li>
          ))}
        </ul>

        {warnings.length > 0 ? (
          <div className="rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800">
            {warnings.map((warning, index) => (
              <p key={`${warning.allocation.lot_id}-${index}`}>
                ⚠️ มี 1 รายการที่ตัดจากยาที่{warning.expiry.detail} ({warning.expiry.headline}) —{" "}
                {warning.name} ล็อต {warning.allocation.lot_number}
              </p>
            ))}
          </div>
        ) : null}

        <div className="flex items-center justify-between border-t border-slate-200 pt-3">
          <span className="text-sm text-slate-600">ยอดโดยประมาณ</span>
          <MoneyText value={estimatedTotal} withUnit className="text-lg font-semibold" />
        </div>
        <p className="text-xs text-slate-500">ยอดจริงคิดจากระบบหลังบันทึก</p>

        {slow ? (
          <p className="text-xs font-medium text-amber-700">
            ยังกำลังบันทึกอยู่ กรุณารอสักครู่ ห้ามปิดหน้าต่าง
          </p>
        ) : null}

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
          <Button type="button" disabled={!armed || saving} onClick={onConfirm}>
            {saving ? "กำลังบันทึก..." : "ยืนยันการขาย"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
