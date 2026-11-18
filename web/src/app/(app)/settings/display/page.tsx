"use client";

import { useEffect, useState } from "react";
import { Check } from "lucide-react";

import { PageHeader } from "@/components/common/PageHeader";
import { chooseTheme, readChoice, THEME_CHOICES, type ThemeChoice } from "@/lib/theme";

/** การแสดงผล: อัตโนมัติ · ฟ้า · ขาว (D71). For this phone or computer only —
 *  each person's own device, so every role may open it. */
export default function DisplaySettingsPage() {
  const [choice, setChoice] = useState<ThemeChoice | null>(null);
  const [notStored, setNotStored] = useState(false);

  // Read after mounting: the server cannot know what this browser stored.
  useEffect(() => setChoice(readChoice()), []);

  return (
    <div className="page-stack">
      <PageHeader title="การแสดงผล" description="สีของแอปบนเครื่องนี้ — เปลี่ยนแค่สี ขนาดและตำแหน่งปุ่มเหมือนเดิม" />

      <fieldset className="space-y-2">
        <legend className="mb-2 text-sm font-medium text-slate-700">ธีม</legend>
        <ul className="list-group" data-plain="" role="radiogroup" aria-label="ธีม">
          {THEME_CHOICES.map((entry) => {
            const picked = choice === entry.value;
            return (
              <li key={entry.value} className="list-row" data-opens="">
                <label className="flex min-h-11 w-full cursor-pointer items-center gap-3">
                  <input
                    type="radio"
                    name="theme"
                    value={entry.value}
                    checked={picked}
                    onChange={() => {
                      setChoice(entry.value);
                      setNotStored(!chooseTheme(entry.value));
                    }}
                    className="sr-only"
                  />
                  <span className="list-row-main">
                    <span className="list-row-title block">{entry.label}</span>
                    <span className="list-row-sub block">{entry.hint}</span>
                  </span>
                  {/* Picked: a tick AND the word, never colour alone (D34). */}
                  {picked ? (
                    <span className="flex shrink-0 items-center gap-1 text-sm font-semibold text-slate-900">
                      <Check aria-hidden="true" className="size-5" strokeWidth={2.75} />
                      ใช้อยู่
                    </span>
                  ) : null}
                </label>
              </li>
            );
          })}
        </ul>
      </fieldset>

      {notStored ? (
        <p role="status" className="text-sm text-slate-700">
          เครื่องนี้จำค่าไม่ได้ (เบราว์เซอร์ไม่ให้เก็บ) — ใช้ธีมนี้ได้จนกว่าจะปิดหน้า แล้วจะกลับเป็นอัตโนมัติ
        </p>
      ) : null}
    </div>
  );
}
