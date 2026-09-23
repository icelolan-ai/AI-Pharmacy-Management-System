import { EmptyState } from "@/components/common/EmptyState";
import {
  outcomeText,
  trackX,
  DUMBBELL_TRACK_HEIGHT,
  DUMBBELL_WIDTH,
  TRACK_LEFT,
  TRACK_RIGHT,
  TRACK_Y,
} from "@/lib/charts/dumbbell";

/** One line of a goods-received note: what the delivery note claimed, and what
 *  was actually counted off the trolley. */
export type DumbbellRow = {
  key: string;
  label: string;
  sublabel?: string;
  unit: string;
  /** ตามใบส่งของ */
  expected: number;
  /** รับจริง — null while the receipt is still a draft and nobody has counted. */
  actual: number | null;
};

/** Every label around the drawing, at one size, named once so a check can
 *  compare them (D45). */
const LABEL_TEXT = "text-sm text-slate-600";

/** เทียบ "ตามใบส่งของ" กับ "รับจริง" ของแต่ละรายการในใบรับ (U-7).
 *
 *  Drawn by hand in SVG — D35 forbids a charting package, and these shapes
 *  are a line and two circles.
 *
 *  D45: not one word goes inside the <svg>. An earlier version put the name,
 *  the numbers and the outcome in there, and they scaled with the drawing —
 *  under 8px on a phone, larger than the section heading on a wide screen.
 *  The drawing is now one short track per row, and everything readable sits
 *  around it as HTML.
 *
 *  D34 runs through the rest: every dot's number is written out, the two ends
 *  are told apart by fill as well as by position, and each row says what
 *  happened to it ("ขาด 2 กล่อง") instead of leaving it to a colour.
 *
 *  The component does no arithmetic beyond placing the dots: both numbers
 *  come from the API exactly as stored.
 */
export function DumbbellChart({ rows, caption }: { rows: readonly DumbbellRow[]; caption: string }) {
  const counted = rows.filter((row) => row.actual !== null);

  if (rows.length === 0) {
    return <EmptyState title="ไม่มีรายการในใบรับนี้ จึงยังไม่มีกราฟให้ดู" />;
  }
  if (counted.length === 0) {
    // Never draw an empty frame or a guessed line: say why there is nothing.
    return <EmptyState title="ใบนี้ยังไม่ได้นับของจริง จึงยังเทียบกับใบส่งของไม่ได้" />;
  }

  const largest = Math.max(...rows.map((row) => Math.max(row.expected, row.actual ?? 0)), 1);

  return (
    <figure className="m-0">
      <figcaption className="mb-2 text-sm text-slate-600">{caption}</figcaption>

      {/* Legend in words, so the two ends are never only a colour apart. */}
      <div className={`mb-1 flex flex-wrap items-center gap-x-4 gap-y-1 ${LABEL_TEXT}`}>
        <span className="flex items-center gap-1.5">
          <svg width="14" height="14" aria-hidden="true">
            <circle cx="7" cy="7" r="5" fill="white" stroke="#475569" strokeWidth="2" />
          </svg>
          วงกลมกลวง = ตามใบส่งของ
        </span>
        <span className="flex items-center gap-1.5">
          <svg width="14" height="14" aria-hidden="true">
            <circle cx="7" cy="7" r="5" fill="#0f172a" />
          </svg>
          วงกลมทึบ = รับจริง
        </span>
      </div>

      <p className={LABEL_TEXT}>ทุกแถวใช้สเกลเดียวกัน · ซ้ายสุด = 0 · ขวาสุด = {largest}</p>

      <ul className="mt-1 max-w-2xl divide-y divide-slate-100">
        {rows.map((row) => {
          const outcome = outcomeText(row.expected, row.actual, row.unit);
          const difference = row.actual === null ? null : row.actual - row.expected;
          const expectedX = trackX(row.expected, largest);
          const actualX = row.actual === null ? null : trackX(row.actual, largest);

          return (
            <li key={row.key} className="py-3">
              <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                <span className="text-base font-semibold text-slate-900">{row.label}</span>
                <span className="text-sm text-slate-800">
                  {difference !== null && difference !== 0 ? "⚠️ " : ""}
                  {outcome}
                </span>
              </div>
              {row.sublabel ? <p className={LABEL_TEXT}>{row.sublabel}</p> : null}

              <svg
                viewBox={`0 0 ${DUMBBELL_WIDTH} ${DUMBBELL_TRACK_HEIGHT}`}
                className="mt-1 w-full"
                role="img"
                aria-label={`${row.label} ใบส่งของ ${row.expected} รับจริง ${row.actual === null ? "ยังไม่ได้นับ" : row.actual} ${outcome}`}
              >
                {/* Every row carries the whole 0..max track, not just the piece
                    between the two dots. Without it a dot sat in mid-air with
                    nothing to read it against, and a row whose numbers agree
                    showed one dot and no line at all — which is what made the
                    first version unreadable. */}
                <line
                  x1={TRACK_LEFT}
                  y1={TRACK_Y}
                  x2={TRACK_RIGHT}
                  y2={TRACK_Y}
                  stroke="#e2e8f0"
                  strokeWidth="2"
                  strokeLinecap="round"
                />

                {actualX !== null && actualX !== expectedX ? (
                  <line
                    x1={Math.min(expectedX, actualX)}
                    y1={TRACK_Y}
                    x2={Math.max(expectedX, actualX)}
                    y2={TRACK_Y}
                    stroke="#b45309"
                    strokeWidth="5"
                    strokeLinecap="round"
                  />
                ) : null}

                <circle cx={expectedX} cy={TRACK_Y} r="7" fill="white" stroke="#475569" strokeWidth="2" />
                {actualX !== null ? <circle cx={actualX} cy={TRACK_Y} r="7" fill="#0f172a" /> : null}
              </svg>

              <p className="text-sm text-slate-700">
                ใบส่งของ {row.expected} · รับจริง {row.actual === null ? "—" : row.actual} {row.unit}
              </p>
            </li>
          );
        })}
      </ul>
    </figure>
  );
}
