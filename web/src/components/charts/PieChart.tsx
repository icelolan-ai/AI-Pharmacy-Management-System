import { EmptyState } from "@/components/common/EmptyState";
import { MoneyText } from "@/components/common/MoneyText";
import { sumMoney, toSatang } from "@/lib/format/money";
import { wholePercentShares } from "@/lib/format/percent";

export type PieSlice = {
  key: string;
  label: string;
  /** A money string from the API. Never summed in the browser (D42). */
  value: string;
  /** Fill for the wedge. Nothing depends on it — the table below says
   *  everything the colours do, because D34 forbids colour carrying meaning. */
  fill: string;
};

const SIZE = 220;
const RADIUS = 96;
const CENTRE = SIZE / 2;

/** Where a wedge boundary falls on the circle, starting at twelve o'clock and
 *  running clockwise, which is how people read a pie. */
function pointAt(fraction: number): { x: number; y: number } {
  const angle = fraction * 2 * Math.PI - Math.PI / 2;
  return { x: CENTRE + RADIUS * Math.cos(angle), y: CENTRE + RADIUS * Math.sin(angle) };
}

function wedgePath(from: number, to: number): string {
  // A full circle cannot be drawn as one arc — the start and end points are
  // the same, so the path collapses. Two half arcs instead.
  if (to - from >= 1) {
    const top = pointAt(0);
    const bottom = pointAt(0.5);
    return [
      `M ${top.x} ${top.y}`,
      `A ${RADIUS} ${RADIUS} 0 0 1 ${bottom.x} ${bottom.y}`,
      `A ${RADIUS} ${RADIUS} 0 0 1 ${top.x} ${top.y}`,
      "Z",
    ].join(" ");
  }
  const start = pointAt(from);
  const end = pointAt(to);
  const largeArc = to - from > 0.5 ? 1 : 0;
  return [
    `M ${CENTRE} ${CENTRE}`,
    `L ${start.x} ${start.y}`,
    `A ${RADIUS} ${RADIUS} 0 ${largeArc} 1 ${end.x} ${end.y}`,
    "Z",
  ].join(" ");
}

/** สัดส่วนมูลค่าสต็อกแยกตามระดับความเสี่ยงวันหมดอายุ (U-7 · D42).
 *
 *  Drawn by hand in SVG — D35 allows no charting package, and a pie is arcs.
 *
 *  D34 decides the shape of it. A wedge cannot be identified by its colour:
 *  the table underneath names every slice with its money and its percentage,
 *  and that table is the real content. The circle is there to show proportion
 *  at a glance, nothing more. Slices are often far too thin to hold a label,
 *  which is exactly why the table is not an optional legend.
 *
 *  Percentages come from wholePercentShares, so the column adds to 100 rather
 *  than to 99 or 101.
 */
export function PieChart({
  slices,
  caption,
  totalLabel = "รวม",
}: {
  slices: readonly PieSlice[];
  caption: string;
  totalLabel?: string;
}) {
  const satang = slices.map((slice) => ({ key: slice.key, satang: toSatang(slice.value) }));
  const total = satang.reduce((sum, entry) => sum + entry.satang, 0);

  if (slices.length === 0 || total <= 0) {
    return <EmptyState title="ยังไม่มีมูลค่าสต็อกให้แบ่งสัดส่วน" />;
  }

  const totalValue = sumMoney(slices.map((slice) => slice.value));
  const percent = wholePercentShares(slices.map((s) => ({ key: s.key, value: s.value })));

  // Boundaries from a running total taken per slice rather than a counter
  // carried across the map: four slices, and nothing mutates during render.
  // The last wedge is closed at exactly 1 so rounding cannot leave a hairline
  // of background showing through the circle.
  const wedges = slices.map((slice, index) => {
    const before = satang.slice(0, index).reduce((sum, entry) => sum + entry.satang, 0);
    return {
      slice,
      from: before / total,
      to: index === slices.length - 1 ? 1 : (before + satang[index].satang) / total,
    };
  });

  return (
    <figure className="m-0">
      <figcaption className="mb-3 text-sm text-slate-600">{caption}</figcaption>

      <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
        <svg
          viewBox={`0 0 ${SIZE} ${SIZE}`}
          className="w-40 shrink-0 sm:w-52"
          role="img"
          aria-label={caption}
        >
          {wedges.map(({ slice, from, to }) =>
            to > from ? (
              <path
                key={slice.key}
                d={wedgePath(from, to)}
                fill={slice.fill}
                stroke="white"
                strokeWidth="2"
              />
            ) : null,
          )}
        </svg>

        {/* The table is the content, not a colour key. Every slice is named
            with its money and its share, so none of this depends on telling
            one wedge from another by eye (D34). */}
        <table className="w-full text-sm">
          <caption className="sr-only">{caption}</caption>
          <thead>
            <tr className="border-b border-slate-200 text-left text-slate-500">
              <th scope="col" className="py-1 font-medium">
                ระดับ
              </th>
              <th scope="col" className="py-1 text-right font-medium">
                มูลค่า
              </th>
              <th scope="col" className="py-1 text-right font-medium">
                สัดส่วน
              </th>
            </tr>
          </thead>
          <tbody>
            {slices.map((slice) => (
              <tr key={slice.key} className="border-b border-slate-100">
                <th scope="row" className="py-2 pr-2 text-left font-normal text-slate-800">
                  <span
                    aria-hidden="true"
                    className="mr-2 inline-block h-3 w-3 rounded-sm align-middle"
                    style={{ backgroundColor: slice.fill }}
                  />
                  {slice.label}
                </th>
                <td className="py-2 text-right tabular-nums">
                  <MoneyText value={slice.value} />
                </td>
                <td className="py-2 text-right tabular-nums">{percent.get(slice.key) ?? 0}%</td>
              </tr>
            ))}
            <tr className="font-medium">
              <th scope="row" className="py-2 pr-2 text-left">
                {totalLabel}
              </th>
              <td className="py-2 text-right tabular-nums">
                <MoneyText value={totalValue} withUnit />
              </td>
              <td className="py-2 text-right tabular-nums">100%</td>
            </tr>
          </tbody>
        </table>
      </div>
    </figure>
  );
}
