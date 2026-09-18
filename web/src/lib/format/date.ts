/** Dates. The API uses ISO (YYYY-MM-DD, Gregorian); the UI shows Buddhist years.
 *  All date maths lives in this file and expiry.ts — never in components. */

export const BE_OFFSET = 543;

/** The shop's timezone. "Today" is always this one, never the browser's (D9). */
export const TZ = "Asia/Bangkok";

const THAI_MONTHS_SHORT = [
  "ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.",
  "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค.",
];

export const THAI_MONTHS_FULL = [
  "มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน",
  "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม",
];

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

export function isLeapYear(yearAD: number): boolean {
  return yearAD % 4 === 0 && (yearAD % 100 !== 0 || yearAD % 400 === 0);
}

export function daysInMonth(month: number, yearAD: number): number {
  if (month < 1 || month > 12) throw new Error(`invalid month: ${month}`);
  const lengths = [31, isLeapYear(yearAD) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return lengths[month - 1];
}

export function parseISODate(iso: string): { year: number; month: number; day: number } | null {
  const match = ISO_DATE.exec(iso.trim());
  if (!match) return null;
  return { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) };
}

/** "2027-06-30" -> "30 มิ.ย. 2570" */
export function formatDateBE(iso: string | null | undefined, placeholder = "-"): string {
  if (!iso) return placeholder;
  const parts = parseISODate(iso);
  if (!parts) return placeholder;
  return `${parts.day} ${THAI_MONTHS_SHORT[parts.month - 1]} ${parts.year + BE_OFFSET}`;
}

/** "2027-06-30" -> "มิถุนายน 2570" (lots are usually discussed by month) */
export function formatMonthYearBE(iso: string | null | undefined, placeholder = "-"): string {
  if (!iso) return placeholder;
  const parts = parseISODate(iso);
  if (!parts) return placeholder;
  return `${THAI_MONTHS_FULL[parts.month - 1]} ${parts.year + BE_OFFSET}`;
}

/** ISO timestamp -> "18 ก.ย. 2569 09:41" in the browser's timezone. */
export function formatDateTimeBE(iso: string | null | undefined, placeholder = "-"): string {
  if (!iso) return placeholder;
  const timestamp = Date.parse(iso);
  if (Number.isNaN(timestamp)) return placeholder;
  const date = new Date(timestamp);
  const day = date.getDate();
  const month = THAI_MONTHS_SHORT[date.getMonth()];
  const year = date.getFullYear() + BE_OFFSET;
  return `${day} ${month} ${year} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** Month + Buddhist year -> ISO date of the LAST day of that month.
 *  Lot expiry is printed as month/year on the box, and the lot is good through
 *  the end of that month. monthYearBEToISO(6, 2570) === "2027-06-30" */
export function monthYearBEToISO(month: number, yearBE: number): string {
  if (!Number.isInteger(month) || month < 1 || month > 12) {
    throw new Error(`invalid month: ${month}`);
  }
  if (!Number.isInteger(yearBE)) throw new Error(`invalid Buddhist year: ${yearBE}`);
  const yearAD = yearBE - BE_OFFSET;
  return `${yearAD}-${pad(month)}-${pad(daysInMonth(month, yearAD))}`;
}

/** "2027-06-30" -> "06/2570" — how an expiry is printed on the box (D16). */
export function formatExpiryBE(iso: string | null | undefined, placeholder = "-"): string {
  if (!iso) return placeholder;
  const parts = parseISODate(iso);
  if (!parts) return placeholder;
  return `${pad(parts.month)}/${parts.year + BE_OFFSET}`;
}

/** Epoch milliseconds -> "14:22". Components must not read the clock
 *  themselves, so "อัปเดตล่าสุด" goes through here. */
export function formatClockTime(epochMs: number | null | undefined, placeholder = "-"): string {
  if (epochMs === null || epochMs === undefined) return placeholder;
  const at = new Date(epochMs);
  return `${pad(at.getHours())}:${pad(at.getMinutes())}`;
}

/** Today in the shop's timezone as "YYYY-MM-DD" (D9).
 *  Components must never read the clock themselves. */
export function todayBangkokISO(): string {
  // en-CA formats as YYYY-MM-DD, so no manual assembly is needed.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

export function todayBangkok(): { year: number; month: number; day: number } {
  return parseISODate(todayBangkokISO())!;
}

const MS_PER_DAY = 86_400_000;

function toUTC(parts: { year: number; month: number; day: number }): number {
  return Date.UTC(parts.year, parts.month - 1, parts.day);
}

/** Whole days from `fromISO` to `toISO`; null when either date is unparseable. */
export function daysBetween(fromISO: string, toISO: string): number | null {
  const from = parseISODate(fromISO);
  const to = parseISODate(toISO);
  if (!from || !to) return null;
  return Math.round((toUTC(to) - toUTC(from)) / MS_PER_DAY);
}

/** Shift an ISO date by whole days: addDays("2026-09-30", -1) === "2026-09-29" */
export function addDays(iso: string, days: number): string | null {
  const parts = parseISODate(iso);
  if (!parts) return null;
  const shifted = new Date(toUTC(parts) + days * MS_PER_DAY);
  return `${shifted.getUTCFullYear()}-${pad(shifted.getUTCMonth() + 1)}-${pad(shifted.getUTCDate())}`;
}

export function isoToMonthYearBE(iso: string): { month: number; yearBE: number } | null {
  const parts = parseISODate(iso);
  if (!parts) return null;
  return { month: parts.month, yearBE: parts.year + BE_OFFSET };
}
