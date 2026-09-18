"use client";

import { useEffect, useRef, useState } from "react";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const DEBOUNCE_MS = 300;

/** Search box that waits 300ms after typing stops before asking the caller to
 *  search. The caller cancels its in-flight request (AbortController). */
export function MedicineSearchInput({
  value,
  onDebouncedChange,
  label = "ค้นหา",
  placeholder = "ชื่อยา ชื่อสามัญ หรือบาร์โค้ด",
  id = "medicine-search",
}: {
  value: string;
  onDebouncedChange: (term: string) => void;
  label?: string;
  placeholder?: string;
  id?: string;
}) {
  const [text, setText] = useState(value);
  const callbackRef = useRef(onDebouncedChange);
  callbackRef.current = onDebouncedChange;

  useEffect(() => {
    const timer = setTimeout(() => callbackRef.current(text.trim()), DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [text]);

  return (
    <div className="w-full max-w-sm space-y-1">
      <Label htmlFor={id} className="text-xs text-slate-600">
        {label}
      </Label>
      <Input
        id={id}
        type="search"
        inputMode="search"
        autoComplete="off"
        placeholder={placeholder}
        value={text}
        onChange={(event) => setText(event.target.value)}
      />
    </div>
  );
}
