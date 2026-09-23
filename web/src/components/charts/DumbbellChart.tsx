import { EmptyState } from "@/components/common/EmptyState";

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

// The drawing is laid out in these units and scaled to the container. At a
// phone's 375px it lands near 1:1; on a desktop it grows, which only makes the
// numbers easier to read (D34).
const WIDTH = 360;
const ROW_HEIGHT = 88;
const TRACK_LEFT = 10;
const TRACK_RIGHT = WIDTH - 10;
const HEADER_HEIGHT = 30;

// Font sizes are in viewBox units. On a 375px phone the drawing lands at about
// 0.95 scale, so 15 here renders near 14px and 13 near 12px. An earlier draft
// used 10 and 11, which measured 9.5px on the phone — too small for D34, and
// only visible by measuring the rendered box rather than reading the source.
const FONT_NAME = 15;
const FONT_BODY = 13;

/** เทียบ "ตามใบส่งของ" กับ "รับจริง" ของแต่ละรายการในใบรับ (U-7).
 *
 *  Drawn by hand in SVG — D35 forbids a charting package, and these shapes are
 *  a line and two circles.
 *
 *  D34 runs through it: every dot carries its number in text, the two ends are
 *  told apart by fill as well as position, and the outcome of each row is
 *  written out ("ขาด 2 กล่อง") rather than left to colour. Nothing here can be
 *  read by hue alone.
 *
 *  The component does no arithmetic beyond placing the dots: both numbers come
 *  from the API exactly as stored.
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
  const height = HEADER_HEIGHT + rows.length * ROW_HEIGHT;
  const position = (value: number) =>
    TRACK_LEFT + (value / largest) * (TRACK_RIGHT - TRACK_LEFT);

  return (
    <figure className="m-0">
      <figcaption className="mb-2 text-sm text-slate-600">{caption}</figcaption>

      {/* Legend in words, so the two ends are never only a colour apart. */}
      <div className="mb-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-600">
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

      <svg
        viewBox={`0 0 ${WIDTH} ${height}`}
        className="w-full max-w-2xl"
        role="img"
        aria-label={caption}
      >
        <line
          x1={TRACK_LEFT}
          y1={HEADER_HEIGHT - 12}
          x2={TRACK_RIGHT}
          y2={HEADER_HEIGHT - 12}
          stroke="#e2e8f0"
          strokeWidth="1"
        />
        <text x={TRACK_LEFT} y={HEADER_HEIGHT - 18} fontSize={FONT_BODY} fill="#64748b">
          0
        </text>
        <text
          x={TRACK_RIGHT}
          y={HEADER_HEIGHT - 18}
          fontSize={FONT_BODY}
          fill="#64748b"
          textAnchor="end"
        >
          {largest}
        </text>

        {rows.map((row, index) => {
          const top = HEADER_HEIGHT + index * ROW_HEIGHT;
          const trackY = top + 55;
          const expectedX = position(row.expected);
          const actualX = row.actual === null ? null : position(row.actual);
          const difference = row.actual === null ? null : row.actual - row.expected;

          const outcome =
            difference === null
              ? "ยังไม่ได้นับ"
              : difference === 0
                ? "ตรงกับใบส่งของ"
                : difference < 0
                  ? `ขาด ${Math.abs(difference)} ${row.unit}`
                  : `เกิน ${difference} ${row.unit}`;

          return (
            <g key={row.key}>
              <text x={TRACK_LEFT} y={top + 15} fontSize={FONT_NAME} fill="#0f172a" fontWeight="600">
                {row.label}
              </text>
              {row.sublabel ? (
                <text x={TRACK_LEFT} y={top + 33} fontSize={FONT_BODY} fill="#64748b">
                  {row.sublabel}
                </text>
              ) : null}
              <text x={TRACK_RIGHT} y={top + 33} fontSize={FONT_BODY} fill="#0f172a" textAnchor="end">
                {difference !== null && difference !== 0 ? "⚠️ " : ""}
                {outcome}
              </text>

              {/* Every row carries the whole 0..max track, not just the piece
                  between the two dots. Without it a dot sat in mid-air with
                  nothing to read it against, and a row where both numbers
                  agree showed one dot and no line at all — which is what made
                  the first version unreadable. */}
              <line
                x1={TRACK_LEFT}
                y1={trackY}
                x2={TRACK_RIGHT}
                y2={trackY}
                stroke="#e2e8f0"
                strokeWidth="2"
                strokeLinecap="round"
              />

              {actualX !== null && actualX !== expectedX ? (
                <line
                  x1={Math.min(expectedX, actualX)}
                  y1={trackY}
                  x2={Math.max(expectedX, actualX)}
                  y2={trackY}
                  stroke="#b45309"
                  strokeWidth="5"
                  strokeLinecap="round"
                />
              ) : null}

              <circle cx={expectedX} cy={trackY} r="7" fill="white" stroke="#475569" strokeWidth="2" />
              {actualX !== null ? <circle cx={actualX} cy={trackY} r="7" fill="#0f172a" /> : null}

              <text x={TRACK_LEFT} y={top + 75} fontSize={FONT_BODY} fill="#334155">
                ใบส่งของ {row.expected} · รับจริง {row.actual === null ? "—" : row.actual}
              </text>
            </g>
          );
        })}
      </svg>
    </figure>
  );
}
