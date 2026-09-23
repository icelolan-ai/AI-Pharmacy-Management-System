/** Where the two dots of a received-goods row go, and what the row says.
 *
 *  Both live here rather than inside the component so that a check can run
 *  them instead of re-typing them. The check used to carry its own copy of
 *  this arithmetic and of this wording, which proves only that the copy
 *  agrees with itself (D43-a).
 *
 *  The drawing holds shapes and nothing else — every word around it is HTML
 *  at a size that does not move (D45).
 */

export const DUMBBELL_WIDTH = 360;
/** One row's track, tall enough for the dots and no taller. */
export const DUMBBELL_TRACK_HEIGHT = 26;
export const TRACK_Y = DUMBBELL_TRACK_HEIGHT / 2;
export const TRACK_LEFT = 10;
export const TRACK_RIGHT = DUMBBELL_WIDTH - 10;

/** A quantity's place along the track.
 *
 *  `largest` is the biggest number anywhere in the receipt, so every row is
 *  drawn to one scale: a per-row scale would make a shortfall of two look the
 *  same as a shortfall of two hundred.
 */
export function trackX(value: number, largest: number): number {
  if (largest <= 0) return TRACK_LEFT;
  const clamped = Math.min(Math.max(value, 0), largest);
  return TRACK_LEFT + (clamped / largest) * (TRACK_RIGHT - TRACK_LEFT);
}

/** What happened to this line, in words.
 *
 *  Never a colour and never only a gap between two dots: the difference is
 *  spelled out with its number and its unit (D34). A line nobody has counted
 *  says so rather than being drawn as if it matched — 03-api-spec.md 411
 *  takes an uncounted line as invoiced, and the caller resolves that before
 *  it gets here, so a null at this point really means "not counted".
 */
export function outcomeText(expected: number, actual: number | null, unit: string): string {
  if (actual === null) return "ยังไม่ได้นับ";
  const difference = actual - expected;
  if (difference === 0) return "ตรงกับใบส่งของ";
  if (difference < 0) return `ขาด ${Math.abs(difference)} ${unit}`;
  return `เกิน ${difference} ${unit}`;
}
