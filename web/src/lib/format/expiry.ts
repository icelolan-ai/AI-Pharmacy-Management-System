/** The single place where expiry is worked out (D18 + D19).
 *
 *  Backend rule (D10): a lot is sellable only while `expiry_date > today`,
 *  so the last day it can be sold is the day BEFORE expiry_date, and the
 *  number of days shown on screen is the API's days_remaining minus 1.
 *  Components must never do this arithmetic themselves.
 */

import { addDays, daysBetween, formatDateBE, todayBangkokISO } from "./date";

export type RiskLevel = "critical" | "high_risk" | "warning" | "normal" | "expired";

/** Same thresholds as the backend, applied to the RAW value (D19 rule 7). */
const RISK_THRESHOLDS: [number, RiskLevel][] = [
  [30, "critical"],
  [90, "high_risk"],
  [180, "warning"],
];

export const RISK_META: Record<RiskLevel, { label: string; icon: string; className: string }> = {
  expired: { label: "ขายไม่ได้แล้ว", icon: "⛔", className: "text-slate-500" },
  critical: { label: "ใกล้หมดอายุมาก", icon: "🔴", className: "text-red-600" },
  high_risk: { label: "ใกล้หมดอายุ", icon: "🟠", className: "text-orange-600" },
  warning: { label: "เฝ้าระวัง", icon: "🟡", className: "text-yellow-700" },
  normal: { label: "ปกติ", icon: "🟢", className: "text-green-700" },
};

/** Exactly what the backend sends: expiry_date − today (shop timezone). */
export function rawDaysRemaining(expiryISO: string): number {
  const days = daysBetween(todayBangkokISO(), expiryISO);
  if (days === null) throw new Error(`invalid ISO date: ${expiryISO}`);
  return days;
}

/** ★ D19 — the number the user sees. Uses the API's value when given. */
export function daysLeftToSell(expiryISO: string, apiDaysRemaining?: number): number {
  return (apiDaysRemaining ?? rawDaysRemaining(expiryISO)) - 1;
}

/** "2026-09-30" -> "2026-09-29" (last day the lot may still be sold). */
export function lastSellableDate(expiryISO: string): string {
  const previous = addDays(expiryISO, -1);
  if (previous === null) throw new Error(`invalid ISO date: ${expiryISO}`);
  return previous;
}

/** D10: sellable only while expiry_date > today. */
export function isSellable(expiryISO: string, apiDaysRemaining?: number): boolean {
  return (apiDaysRemaining ?? rawDaysRemaining(expiryISO)) > 0;
}

/** Fallback only — prefer the API's risk_level (D19 rule 7). */
export function riskFromRawDays(rawDays: number): RiskLevel {
  if (rawDays <= 0) return "expired";
  for (const [maxDays, level] of RISK_THRESHOLDS) {
    if (rawDays <= maxDays) return level;
  }
  return "normal";
}

export function riskFromExpiry(expiryISO: string): RiskLevel {
  return riskFromRawDays(rawDaysRemaining(expiryISO));
}

export function sellableUntilText(expiryISO: string): string {
  return `ขายได้ถึง ${formatDateBE(lastSellableDate(expiryISO))}`;
}

/** Days -> "11 วัน" / "2 เดือน" / "3 ปี 9 เดือน" (over 60 days reads coarser). */
function approximate(days: number): string {
  if (days <= 60) return `${days} วัน`;
  const years = Math.floor(days / 365);
  const months = Math.floor((days - years * 365) / 30);
  if (years > 0) return months > 0 ? `${years} ปี ${months} เดือน` : `${years} ปี`;
  return `${months} เดือน`;
}

/** The standard sentence for "how long is left" — never write this per page. */
export function humanRemaining(expiryISO: string, apiDaysRemaining?: number): string {
  const days = daysLeftToSell(expiryISO, apiDaysRemaining);
  if (days < 0) return `ขายไม่ได้แล้ว (ผ่านมา ${-days} วัน)`;
  if (days === 0) return "ขายได้ถึงวันนี้ — วันสุดท้าย";
  return `เหลือ ${approximate(days)}`;
}

export function expiryHelperText(expiryISO: string, apiDaysRemaining?: number): string {
  const days = daysLeftToSell(expiryISO, apiDaysRemaining);
  const base = `หมดอายุ ${formatDateBE(expiryISO)} · ${sellableUntilText(expiryISO)}`;
  return days < 0 ? base : `${base} (อีก ${approximate(days)})`;
}

/** Everything a screen needs about one lot's expiry, computed in one place.
 *  Wording follows the table in docs/05-web-spec.md 5.0.6. */
export function describeExpiry(expiryISO: string, apiDaysRemaining?: number) {
  const raw = apiDaysRemaining ?? rawDaysRemaining(expiryISO);
  const days = raw - 1;
  const risk = riskFromRawDays(raw);
  const lastDayText = formatDateBE(lastSellableDate(expiryISO));

  let headline: string;
  if (days < 0) headline = "ขายไม่ได้แล้ว";
  else if (days === 0) headline = `ขายได้ถึงวันนี้ (${lastDayText}) — วันสุดท้าย`;
  else headline = `เหลือ ${approximate(days)}`;

  let detail: string;
  if (days < 0) {
    detail =
      days === -1
        ? `ขายได้ถึง ${lastDayText}`
        : `ขายได้ถึง ${lastDayText} · ผ่านมาแล้ว ${-days} วัน`;
  } else {
    detail = `ขายได้ถึง ${lastDayText}`;
  }

  return {
    raw,
    days,
    risk,
    icon: RISK_META[risk].icon,
    className: RISK_META[risk].className,
    headline,
    detail,
    expiryDateText: formatDateBE(expiryISO),
    lastSellableDateText: lastDayText,
    sellable: raw > 0,
  };
}

/** Wedge fills for the expiry pie (D42). Nothing reads meaning from these —
 *  the table beside the chart names every slice with its money and its share,
 *  because D34 forbids colour from carrying meaning on its own. They follow
 *  RISK_META's traffic-light order so the picture matches the icons used
 *  everywhere else. */
export const RISK_FILL: Record<RiskLevel, string> = {
  expired: "#94a3b8",
  critical: "#dc2626",
  high_risk: "#ea580c",
  warning: "#ca8a04",
  normal: "#15803d",
};
