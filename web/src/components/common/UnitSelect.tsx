"use client";

import { useState } from "react";

import { Input } from "@/components/ui/input";
import { cn } from "cn";

/** หน่วยนับ (medicines.unit, migration 004). The list is a convenience only —
 *  the column is free text, so "อื่น ๆ" lets the shop type its own unit. */
export const UNIT_OPTIONS = ["กล่อง", "ขวด", "แผง", "หลอด", "ซอง", "ชิ้น"] as const;

/** Same default as the database column. */
export const DEFAULT_UNIT = UNIT_OPTIONS[0];

const OTHER = "__other__";

export function isPresetUnit(value: string): boolean {
  return (UNIT_OPTIONS as readonly string[]).includes(value);
}

export function UnitSelect({
  id,
  value,
  onChange,
  disabled,
  invalid,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  invalid?: boolean;
}) {
  // "custom" is chosen once and kept, so the text box does not disappear
  // the moment what was typed happens to match one of the presets.
  const [custom, setCustom] = useState(() => value !== "" && !isPresetUnit(value));

  function handleSelect(next: string) {
    if (next === OTHER) {
      setCustom(true);
      onChange("");
      return;
    }
    setCustom(false);
    onChange(next);
  }

  return (
    <div className="space-y-2">
      <select
        id={id}
        value={custom ? OTHER : value}
        onChange={(event) => handleSelect(event.target.value)}
        disabled={disabled}
        aria-invalid={invalid}
        className={cn(
          "h-8 w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 py-1 text-base",
          "transition-colors outline-none focus-visible:border-ring focus-visible:ring-3",
          "focus-visible:ring-ring/50 disabled:pointer-events-none disabled:cursor-not-allowed",
          "disabled:bg-input/50 disabled:opacity-50 aria-invalid:border-destructive",
          "aria-invalid:ring-3 aria-invalid:ring-destructive/20 md:text-sm dark:bg-input/30",
        )}
      >
        {UNIT_OPTIONS.map((unit) => (
          <option key={unit} value={unit}>
            {unit}
          </option>
        ))}
        <option value={OTHER}>อื่น ๆ (ระบุเอง)</option>
      </select>

      {custom ? (
        <Input
          id={`${id}-custom`}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          disabled={disabled}
          aria-invalid={invalid}
          aria-label="หน่วยนับ (ระบุเอง)"
          placeholder="เช่น ตลับ, ถุง, ชุด"
        />
      ) : null}
    </div>
  );
}
