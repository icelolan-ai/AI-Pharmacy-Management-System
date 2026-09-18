/** The single place where expiry is worked out (D19).
 *
 *  Backend rule (D10): a lot is sellable only while `expiry_date > today`,
 *  so the last day it can be sold is the day BEFORE expiry_date, and the
 *  number of days shown on screen is the API's days_remaining minus 1.
 *  Components must never do this arithmetic themselves.
 */

import { formatDateBE, parseISODate } from "./date";

export type ExpiryTone = "expired" | "critical" | "high_risk" | "warning" | "normal";

const MS_PER_DAY = 86_400_000;

/** "2026-09-30" -> "2026-09-29" (last day the lot may still be sold). */
export function lastSellableDate(expiryISO: string): string {
  const parts = parseISODate(expiryISO);
  if (!parts) throw new Error(`invalid ISO date: ${expiryISO}`);
  const previous = new Date(Date.UTC(parts.year, parts.month - 1, parts.day) - MS_PER_DAY);
  const year = previous.getUTCFullYear();
  const month = String(previous.getUTCMonth() + 1).padStart(2, "0");
  const day = String(previous.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/** API days_remaining -> the number shown to the user (D19). */
export function displayDaysRemaining(apiDaysRemaining: number): number {
  return apiDaysRemaining - 1;
}

/** Colour/tone from the number of sellable days left. */
export function expiryTone(displayDays: number): ExpiryTone {
  if (displayDays < 0) return "expired";
  if (displayDays <= 29) return "critical";
  if (displayDays <= 89) return "high_risk";
  if (displayDays <= 179) return "warning";
  return "normal";
}

/** Human text for a lot, e.g. "ขายได้อีก 19 วัน" / "วันนี้เป็นวันสุดท้าย". */
export function expiryLabel(displayDays: number): string {
  if (displayDays < 0) return "หมดอายุแล้ว";
  if (displayDays === 0) return "วันนี้เป็นวันสุดท้าย";
  return `ขายได้อีก ${displayDays} วัน`;
}

/** Everything a screen needs about one lot's expiry, computed in one place. */
export function describeExpiry(expiryISO: string, apiDaysRemaining: number) {
  const displayDays = displayDaysRemaining(apiDaysRemaining);
  return {
    expiryDateText: formatDateBE(expiryISO),
    lastSellableDateText: formatDateBE(lastSellableDate(expiryISO)),
    displayDays,
    tone: expiryTone(displayDays),
    label: expiryLabel(displayDays),
  };
}
