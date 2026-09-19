"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { addDays, formatDateBE, todayBangkokISO } from "@/lib/format/date";

export type DateRange = { from: string; to: string };

/** A date range the API filters on — the rows are never filtered in the
 *  browser. Inputs are ISO because that is what `<input type="date">` and the
 *  API both speak; the Buddhist year is shown underneath. */
export function DateRangeFilter({
  value,
  onChange,
  presets = true,
  busy,
}: {
  value: DateRange;
  onChange: (range: DateRange) => void;
  presets?: boolean;
  busy?: boolean;
}) {
  const today = todayBangkokISO();

  function applyDays(days: number) {
    onChange({ from: addDays(today, -(days - 1)) ?? today, to: today });
  }

  return (
    <div className="flex flex-wrap items-end gap-3">
      <div>
        <Label htmlFor="date-from" className="text-xs text-slate-600">
          ตั้งแต่
        </Label>
        <Input
          id="date-from"
          type="date"
          className="max-w-44"
          value={value.from}
          disabled={busy}
          onChange={(event) => onChange({ ...value, from: event.target.value })}
        />
        <p className="mt-1 text-xs text-slate-500">{formatDateBE(value.from)}</p>
      </div>
      <div>
        <Label htmlFor="date-to" className="text-xs text-slate-600">
          ถึง
        </Label>
        <Input
          id="date-to"
          type="date"
          className="max-w-44"
          value={value.to}
          disabled={busy}
          onChange={(event) => onChange({ ...value, to: event.target.value })}
        />
        <p className="mt-1 text-xs text-slate-500">{formatDateBE(value.to)}</p>
      </div>

      {presets ? (
        <div className="flex gap-1 pb-5">
          <Button type="button" variant="outline" size="sm" onClick={() => applyDays(1)}>
            วันนี้
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={() => applyDays(7)}>
            7 วัน
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={() => applyDays(30)}>
            30 วัน
          </Button>
        </div>
      ) : null}
    </div>
  );
}

/** Last `days` days up to and including today, in the shop's timezone. */
export function lastDays(days: number): DateRange {
  const today = todayBangkokISO();
  return { from: addDays(today, -(days - 1)) ?? today, to: today };
}
