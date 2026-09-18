"use client";

import { MedicineSearchInput } from "@/components/common/MedicineSearchInput";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export type StockFilter = "all" | "low" | "expiring";

const FILTERS: { value: StockFilter; label: string }[] = [
  { value: "all", label: "ทั้งหมด" },
  { value: "low", label: "เฉพาะสต็อกต่ำ" },
  { value: "expiring", label: "เฉพาะใกล้หมดอายุ" },
];

/** Search hits the API; the two toggles filter the rows already on screen,
 *  so switching them costs no request (docs/05-web-spec.md 5.3). */
export function StockFilters({
  term,
  onTermChange,
  filter,
  onFilterChange,
  shownCount,
  totalCount,
  busy,
}: {
  term: string;
  onTermChange: (value: string) => void;
  filter: StockFilter;
  onFilterChange: (value: StockFilter) => void;
  shownCount: number;
  totalCount: number;
  busy: boolean;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div className="flex flex-wrap items-end gap-3">
        <MedicineSearchInput value={term} onDebouncedChange={onTermChange} />
        <div className="flex gap-1" role="group" aria-label="ตัวกรอง">
          {FILTERS.map((entry) => (
            <Button
              key={entry.value}
              type="button"
              size="sm"
              variant={filter === entry.value ? "default" : "outline"}
              aria-pressed={filter === entry.value}
              onClick={() => onFilterChange(entry.value)}
            >
              {entry.label}
            </Button>
          ))}
        </div>
      </div>
      {!busy ? (
        <Badge variant="secondary">
          {filter === "all"
            ? `ทั้งหมด ${totalCount} รายการ`
            : `แสดง ${shownCount} จาก ${totalCount} รายการ`}
        </Badge>
      ) : null}
    </div>
  );
}
