/** Where the dots of the sales line go (U-7 · D35).
 *
 *  The arithmetic lives here rather than inside the component so that it can
 *  be run by a check instead of only being looked at. A source invariant can
 *  say a `<polyline>` exists; only running this can say the line has a point
 *  for every day and that a day with no sales lands exactly on zero.
 *
 *  Laid out in these units and scaled to the container. Nothing but shapes
 *  goes in them: text inside a drawing that scales is text whose size nobody
 *  controls — at a phone's width the labels shrank below what D34 allows, and
 *  on a wide screen the same labels grew larger than the heading above them.
 *  So the drawing carries lines and dots, and every word is HTML beside it.
 */

export const LINE_WIDTH = 360;
/** Geometry only — every label lives in HTML beside the drawing, so nothing
 *  here needs room for text. */
export const LINE_HEIGHT = 140;
export const LINE_LEFT = 6;
export const LINE_RIGHT = 354;
/** The y a day equal to the maximum sits on. */
export const LINE_TOP = 10;
/** The y a day with no sales sits on — the zero line, drawn and labelled. */
export const LINE_BASELINE = 130;

export type LinePoint = { x: number; y: number };

/** One point per value, in order, including every zero.
 *
 *  Dropping the zero days would let the line slope straight from the day
 *  before a closure to the day after it, drawing trade that never happened —
 *  which is why the endpoint returns them and why nothing here filters.
 *
 *  A single value has nowhere to slope to, so it is centred rather than
 *  divided by a zero span.
 */
export function linePoints(values: readonly number[], max: number): LinePoint[] {
  const span = LINE_RIGHT - LINE_LEFT;
  const rise = LINE_BASELINE - LINE_TOP;
  return values.map((value, index) => ({
    x:
      values.length === 1
        ? LINE_WIDTH / 2
        : LINE_LEFT + (index * span) / (values.length - 1),
    // A negative total is not possible from the API, but a line that escaped
    // below its own zero line would be a lie rather than a glitch.
    y: max <= 0 ? LINE_BASELINE : LINE_BASELINE - (Math.max(value, 0) / max) * rise,
  }));
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

export function polylinePoints(points: readonly LinePoint[]): string {
  return points.map((point) => `${round(point.x)},${round(point.y)}`).join(" ");
}

/** The shaded band under the line: the same path, closed along the zero line.
 *  Decoration only — it says nothing the line does not already say (D34). */
export function areaPath(points: readonly LinePoint[]): string {
  if (points.length === 0) return "";
  const first = points[0];
  const last = points[points.length - 1];
  const along = points.map((point) => `L ${round(point.x)} ${round(point.y)}`).join(" ");
  return `M ${round(first.x)} ${LINE_BASELINE} ${along} L ${round(last.x)} ${LINE_BASELINE} Z`;
}
