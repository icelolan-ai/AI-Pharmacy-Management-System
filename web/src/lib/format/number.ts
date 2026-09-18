/** Quantity / integer helpers (quantities are plain integers in the API). */

const INTEGER_PATTERN = /^\d+$/;

export function formatQty(value: number | null | undefined, placeholder = "-"): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return placeholder;
  return new Intl.NumberFormat("th-TH").format(value);
}

export function formatQtyWithUnit(
  value: number | null | undefined,
  unit: string,
  placeholder = "-",
): string {
  const text = formatQty(value, placeholder);
  return text === placeholder ? text : `${text} ${unit}`;
}

/** Form input -> non-negative integer, or null when empty/invalid. */
export function parseOptionalInteger(value: string): number | null {
  const text = value.trim();
  if (text === "") return null;
  if (!INTEGER_PATTERN.test(text)) return null;
  return Number(text);
}

export function isValidOptionalInteger(value: string): boolean {
  const text = value.trim();
  return text === "" || INTEGER_PATTERN.test(text);
}

/** Barcode rule (งาน 5.2): digits only, at least 8 -> look up by barcode first. */
export function looksLikeBarcode(value: string): boolean {
  const text = value.trim();
  return /^\d{8,}$/.test(text);
}
