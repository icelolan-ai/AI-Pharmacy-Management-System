"use client";

import { useEffect, useState } from "react";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { isoToMonthYearBE, monthYearBEToISO } from "@/lib/format/date";
import { expiryHelperText, isSellable, riskFromExpiry, RISK_META } from "@/lib/format/expiry";
import { cn } from "@/lib/utils";

/** A lot's expiry is printed on the box as month and year only, so it is typed
 *  that way too — never a day picker (5.0.6 rule 3). The stored date is the
 *  LAST day of that month (D16), worked out by monthYearBEToISO(). */

const BE_PREFIX = 25;
const MAX_YEARS_AHEAD = 10;

export type MonthYearState = {
  /** ISO date of the last day of the month, or null while incomplete/invalid. */
  iso: string | null;
  sellable: boolean;
  helper: string | null;
  tone: string;
  /** True when receiving must be blocked: the lot cannot be sold at all (D10). */
  blocking: boolean;
};

export function describeMonthYear(month: string, yearBE: string): MonthYearState {
  const monthValue = Number(month);
  const yearValue = Number(yearBE);
  const complete =
    /^\d{1,2}$/.test(month) &&
    monthValue >= 1 &&
    monthValue <= 12 &&
    /^\d{4}$/.test(yearBE) &&
    yearValue > BE_PREFIX * 100;

  if (!complete) {
    return { iso: null, sellable: false, helper: null, tone: "", blocking: false };
  }

  const iso = monthYearBEToISO(monthValue, yearValue);
  const sellable = isSellable(iso);
  if (!sellable) {
    return {
      iso,
      sellable: false,
      helper: `ขายไม่ได้แล้ว — ${expiryHelperText(iso)} · รับเข้าคลังไม่ได้ กรุณาตรวจสอบกับผู้ส่งสินค้า`,
      tone: RISK_META.expired.className,
      blocking: true,
    };
  }

  const risk = riskFromExpiry(iso);
  const yearsAhead = yearValue - (new Date().getFullYear() + 543);
  if (yearsAhead > MAX_YEARS_AHEAD) {
    return {
      iso,
      sellable: true,
      helper: `วันหมดอายุห่างจากวันนี้ ${yearsAhead} ปี ตรวจสอบอีกครั้ง`,
      tone: RISK_META.high_risk.className,
      blocking: false,
    };
  }

  const helper =
    risk === "critical"
      ? `${expiryHelperText(iso)} — รับเข้าได้ แต่ควรทักท้วงผู้ส่ง`
      : expiryHelperText(iso);
  return { iso, sellable: true, helper, tone: RISK_META[risk].className, blocking: false };
}

export function MonthYearInput({
  id,
  value,
  onChange,
  disabled,
}: {
  id: string;
  /** ISO date (last day of the month) or null. */
  value: string | null;
  onChange: (iso: string | null, state: MonthYearState) => void;
  disabled?: boolean;
}) {
  const parsed = value ? isoToMonthYearBE(value) : null;
  const [month, setMonth] = useState(parsed ? String(parsed.month).padStart(2, "0") : "");
  const [yearBE, setYearBE] = useState(parsed ? String(parsed.yearBE) : "");

  const state = describeMonthYear(month, yearBE);

  useEffect(() => {
    onChange(state.iso, state);
    // Only re-report when the typed values actually change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [month, yearBE]);

  /** Two digits mean the shop typed 69 for 2569 — fill it in on the way out. */
  function normaliseYear() {
    if (/^\d{2}$/.test(yearBE)) setYearBE(`${BE_PREFIX}${yearBE}`);
  }

  return (
    <div className="space-y-1">
      <Label htmlFor={`${id}-month`}>วันหมดอายุ (เดือน / ปี พ.ศ.) *</Label>
      <div className="flex items-center gap-2">
        <Input
          id={`${id}-month`}
          inputMode="numeric"
          placeholder="ดด"
          aria-label="เดือนที่หมดอายุ"
          className="max-w-20"
          value={month}
          disabled={disabled}
          aria-invalid={state.blocking}
          onChange={(event) => setMonth(event.target.value.replace(/\D/g, "").slice(0, 2))}
          onBlur={() => setMonth((current) => (current.length === 1 ? `0${current}` : current))}
        />
        <span className="text-slate-400">/</span>
        <Input
          id={`${id}-year`}
          inputMode="numeric"
          placeholder="ปปปป"
          aria-label="ปีที่หมดอายุ พ.ศ."
          className="max-w-28"
          value={yearBE}
          disabled={disabled}
          aria-invalid={state.blocking}
          onChange={(event) => setYearBE(event.target.value.replace(/\D/g, "").slice(0, 4))}
          onBlur={normaliseYear}
        />
      </div>
      {state.helper ? (
        <p className={cn("text-xs", state.tone)}>
          <span aria-hidden="true">
            {state.blocking ? RISK_META.expired.icon : RISK_META[riskFromExpiry(state.iso!)].icon}
          </span>{" "}
          {state.helper}
        </p>
      ) : null}
    </div>
  );
}
