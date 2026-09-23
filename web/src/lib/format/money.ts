/** Money helpers. The backend sends money as decimal strings ("95.00").
 *  Money is never parsed as a float: every value is converted to an exact
 *  integer number of satang first, and all arithmetic happens on integers. */

const MONEY_PATTERN = /^-?\d+(\.\d{1,2})?$/;

export function isValidMoney(value: string): boolean {
  return MONEY_PATTERN.test(value.trim());
}

/** "95.5" -> 9550 satang (an exact integer; the API caps amounts at
 *  99,999,999.99 = 9,999,999,999 satang, far inside Number.MAX_SAFE_INTEGER). */
export function toSatang(value: string): number {
  const text = value.trim();
  if (!MONEY_PATTERN.test(text)) {
    throw new Error(`invalid money value: ${text}`);
  }
  const negative = text.startsWith("-");
  const [whole, fraction = ""] = text.replace("-", "").split(".");
  // Number() on digit-only strings is exact — this is not float parsing.
  const satang = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  if (!Number.isSafeInteger(satang)) throw new Error(`money value out of range: ${text}`);
  return negative ? -satang : satang;
}

function fromSatang(satang: number): string {
  const negative = satang < 0;
  const absolute = Math.abs(satang);
  const whole = Math.trunc(absolute / 100);
  const fraction = String(absolute % 100).padStart(2, "0");
  return `${negative ? "-" : ""}${whole}.${fraction}`;
}

/** Exact decimal-string addition: addMoney("0.10", "0.20") === "0.30" */
export function addMoney(...values: string[]): string {
  return fromSatang(values.reduce((sum, value) => sum + toSatang(value), 0));
}

export function subtractMoney(a: string, b: string): string {
  return fromSatang(toSatang(a) - toSatang(b));
}

/** quantity x unit price, still exact (quantity must be an integer). */
export function multiplyMoney(value: string, quantity: number): string {
  if (!Number.isInteger(quantity)) throw new Error("quantity must be an integer");
  return fromSatang(toSatang(value) * quantity);
}

export function compareMoney(a: string, b: string): number {
  const left = toSatang(a);
  const right = toSatang(b);
  return left === right ? 0 : left < right ? -1 : 1;
}

/** "1234.5" -> "1,234.50". null / undefined / "" -> the placeholder. */
export function formatMoney(value: string | null | undefined, placeholder = "-"): string {
  if (value === null || value === undefined || value.trim() === "") return placeholder;
  if (!isValidMoney(value)) return placeholder;
  const normalized = fromSatang(toSatang(value));
  const negative = normalized.startsWith("-");
  const [whole, fraction] = normalized.replace("-", "").split(".");
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${negative ? "-" : ""}${grouped}.${fraction}`;
}

export function formatMoneyWithUnit(value: string | null | undefined, placeholder = "-"): string {
  const text = formatMoney(value, placeholder);
  return text === placeholder ? text : `${text} บาท`;
}

/** Form input -> the string the API expects ("95" -> "95.00"). null if invalid. */
export function normalizeMoneyInput(value: string): string | null {
  const text = value.trim();
  if (text === "" || !MONEY_PATTERN.test(text)) return null;
  return fromSatang(toSatang(text));
}

/** Percentage of one money string against another, worked out in satang so no
 *  float ever touches it. Returns null when the total is zero or invalid. */
export function percentOfMoney(part: string, total: string, decimals = 1): number | null {
  if (!isValidMoney(part) || !isValidMoney(total)) return null;
  const totalSatang = toSatang(total);
  if (totalSatang === 0) return null;
  const scale = 10 ** decimals;
  // Integer maths end to end: round to `decimals` places, then scale back.
  return Math.round((toSatang(part) * 100 * scale) / totalSatang) / scale;
}

/** Sum a list of money strings, skipping anything missing. */
export function sumMoney(values: (string | null | undefined)[]): string {
  return addMoney(...values.filter((value): value is string => Boolean(value && isValidMoney(value))));
}
