/** Whole-number percentages that always add to exactly 100.
 *
 *  Rounding each share on its own gives 33/33/33 or 34/33/34 — a pie whose
 *  own labels disagree with itself. Largest remainder fixes that: everyone is
 *  rounded down first, then the leftover points go to the shares with the
 *  biggest fractions.
 *
 *  Counted in satang, so the arithmetic is integer throughout — money is never
 *  put through parseFloat in this project.
 */

import { toSatang } from "@/lib/format/money";

/** A money string from the API, keyed so the caller can find its share again. */
export type Share = { key: string; value: string };

export function wholePercentShares(shares: readonly Share[]): Map<string, number> {
  const result = new Map<string, number>();
  const amounts = shares.map((share) => ({ key: share.key, satang: toSatang(share.value) }));
  const total = amounts.reduce((sum, share) => sum + share.satang, 0);

  if (total <= 0) {
    for (const share of amounts) result.set(share.key, 0);
    return result;
  }

  const floored = amounts.map((share) => {
    const exact = (share.satang * 100) / total;
    const whole = Math.floor(exact);
    return { key: share.key, whole, remainder: exact - whole, satang: share.satang };
  });

  for (const entry of floored) result.set(entry.key, entry.whole);

  let leftover = 100 - floored.reduce((sum, entry) => sum + entry.whole, 0);
  // Biggest fraction first; ties go to the bigger amount, then to the earlier
  // key, so the same input always produces the same picture.
  const order = [...floored].sort(
    (a, b) =>
      b.remainder - a.remainder || b.satang - a.satang || a.key.localeCompare(b.key),
  );
  for (let index = 0; leftover > 0 && index < order.length; index += 1, leftover -= 1) {
    const entry = order[index];
    result.set(entry.key, (result.get(entry.key) ?? 0) + 1);
  }

  return result;
}
