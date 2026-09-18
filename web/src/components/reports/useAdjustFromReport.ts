"use client";

import { useState } from "react";

import { ApiError } from "@/lib/api/client";
import { getLot, type Lot } from "@/lib/api/lots";
import { getMedicine } from "@/lib/api/medicines";

/** Opening the adjust dialog from a report row.
 *
 *  The row only carries a lot_id, and D23 requires the quantity the dialog
 *  shows to be freshly read — so the lot is always reloaded before the dialog
 *  opens, exactly as on /stock/[id].
 */
export function useAdjustFromReport(onAdjusted: () => void) {
  const [open, setOpen] = useState(false);
  const [lot, setLot] = useState<Lot | null>(null);
  const [unit, setUnit] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /** `rowUnit` is omitted on reports that do not carry one (/reports/expired);
   *  the unit then comes from the medicine, so no quantity is ever unitless. */
  async function openFor(lotId: string, rowUnit?: string) {
    setBusy(true);
    setError(null);
    try {
      const fresh = await getLot(lotId);
      setLot(fresh);
      setUnit(rowUnit || (await getMedicine(fresh.medicine_id)).unit);
      setOpen(true);
    } catch (openError) {
      setError(openError instanceof ApiError ? openError.message : "โหลดข้อมูลล็อตไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  }

  return {
    open,
    setOpen,
    lot,
    unit,
    busy,
    error,
    openFor,
    handleAdjusted: () => onAdjusted(),
  };
}
