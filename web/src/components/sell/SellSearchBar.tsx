"use client";

import { forwardRef } from "react";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { Medicine } from "@/lib/api/medicines";
import { describeExpiry } from "@/lib/format/expiry";

export type SearchResult = Medicine & { sellable: boolean; reason?: string };

/** Search and scan. A barcode is handled by the page; this only reports typing,
 *  Enter and arrow keys, and never picks a result on its own (rule 3). */
export const SellSearchBar = forwardRef<
  HTMLInputElement,
  {
    value: string;
    onChange: (value: string) => void;
    onSubmit: () => void;
    results: SearchResult[];
    highlightIndex: number;
    onHighlight: (index: number) => void;
    onPick: (medicine: Medicine) => void;
    searching: boolean;
    ambiguousName: string | null;
  }
>(function SellSearchBar(
  {
    value,
    onChange,
    onSubmit,
    results,
    highlightIndex,
    onHighlight,
    onPick,
    searching,
    ambiguousName,
  },
  ref,
) {
  return (
    <div className="space-y-2">
      <Label htmlFor="sell-search">ยิงบาร์โค้ด หรือ พิมพ์ชื่อยา</Label>
      <Input
        id="sell-search"
        ref={ref}
        autoComplete="off"
        value={value}
        placeholder="ยิงบาร์โค้ด หรือ พิมพ์ชื่อยา"
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            onSubmit();
          } else if (event.key === "ArrowDown") {
            event.preventDefault();
            onHighlight(Math.min(highlightIndex + 1, results.length - 1));
          } else if (event.key === "ArrowUp") {
            event.preventDefault();
            onHighlight(Math.max(highlightIndex - 1, 0));
          }
        }}
      />

      {/* A thin line only — searching must never cover the screen (rule 12). */}
      <div className="h-0.5">
        {searching ? <div className="h-0.5 w-full animate-pulse bg-slate-300" /> : null}
      </div>

      {ambiguousName ? (
        <p className="text-xs font-medium text-amber-700">
          ⚠️ มี {ambiguousName} หลายความแรง กรุณาตรวจสอบ
        </p>
      ) : null}

      {results.length > 0 ? (
        <ul className="max-h-72 overflow-y-auto rounded-lg border border-slate-200 bg-white">
          {results.map((result, index) => {
            const highlighted = index === highlightIndex;
            return (
              <li key={result.id}>
                <button
                  type="button"
                  disabled={!result.sellable}
                  onMouseEnter={() => onHighlight(index)}
                  onClick={() => onPick(result)}
                  className={`flex w-full items-start justify-between gap-3 px-3 py-2 text-left text-sm ${
                    !result.sellable
                      ? "cursor-not-allowed bg-slate-50 text-slate-400"
                      : highlighted
                        ? "bg-slate-100"
                        : "hover:bg-slate-50"
                  }`}
                >
                  <span className="min-w-0">
                    <span className="block text-slate-900">{result.name}</span>
                    <strong className="block text-xs font-semibold text-slate-700">
                      {[result.strength, result.dosage_form].filter(Boolean).join(" · ") || "-"}
                    </strong>
                  </span>
                  <span className="shrink-0 text-right text-xs">
                    {result.sellable ? (
                      <span className="text-slate-600">
                        คงเหลือ {result.available_quantity} {result.unit}
                      </span>
                    ) : (
                      <span className="font-medium text-slate-500">{result.reason}</span>
                    )}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
});

/** A medicine with no sellable stock cannot be put in the basket (rule 7). */
export function toSearchResult(medicine: Medicine): SearchResult {
  if (medicine.available_quantity <= 0) {
    return { ...medicine, sellable: false, reason: "ยาหมด" };
  }
  return { ...medicine, sellable: true };
}

/** Wording for a lot that can no longer be sold, used by the page-level guard. */
export function unsellableReason(expiryISO: string): string {
  const expiry = describeExpiry(expiryISO);
  return `ขายไม่ได้แล้ว (${expiry.detail})`;
}
