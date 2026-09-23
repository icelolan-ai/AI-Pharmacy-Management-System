import { EmptyState } from "@/components/common/EmptyState";
import { MoneyText } from "@/components/common/MoneyText";
import type { SalesTimeseries } from "@/lib/api/reports";
import {
  areaPath,
  linePoints,
  polylinePoints,
  LINE_BASELINE,
  LINE_HEIGHT,
  LINE_LEFT,
  LINE_RIGHT,
  LINE_TOP,
  LINE_WIDTH,
} from "@/lib/charts/line";
import { formatDateBE } from "@/lib/format/date";
import { formatMoney, toSatang } from "@/lib/format/money";

/** Every label around the drawing. Kept in one place so a check can compare
 *  them, and set to the body size rather than to the smallest one that fits:
 *  the shop's owner is not the only person who reads this (D34). */
const LABEL_TEXT = "text-sm text-slate-600";

/** ยอดขายรายวัน (U-7 Line · D35 — วาดเอง ไม่มี library กราฟ).
 *
 *  Every day the endpoint returns is on the line, including the ones with no
 *  sales: they sit on the zero line, which is drawn and labelled, rather than
 *  being left out. A line drawn from a list with holes in it slopes straight
 *  from the day before a closure to the day after and shows trade that never
 *  happened.
 *
 *  Nothing inside the <svg> is a word. The drawing scales to its container,
 *  and text scales with it — labels sized to read on a phone grew larger than
 *  the section heading on a desktop, and labels sized for the desktop were
 *  6px on the phone. So the drawing holds lines and dots, and every label is
 *  HTML at a size that does not move (D34).
 *
 *  D34 decides the rest too. Nothing is carried by colour: the busiest day is
 *  ringed on the drawing AND named in words above the table AND labelled in
 *  the table itself. The table is the real content — the lesson from the pie,
 *  where the circle alone told nobody anything.
 *
 *  When the shop has not sold anything at all in the window the drawing is
 *  replaced by a sentence saying so. An empty frame, or a flat line through
 *  an invented scale, would both look like an answer.
 */
export function SalesLineChart({ data, caption }: { data: SalesTimeseries; caption: string }) {
  const rows = data.days.map((day) => ({ day, satang: toSatang(day.total_amount) }));
  const max = Math.max(0, ...rows.map((row) => row.satang));

  if (rows.length === 0 || max <= 0) {
    return (
      <EmptyState
        title="ยังไม่มีการขายในช่วงนี้"
        description={`ตั้งแต่ ${formatDateBE(data.date_from)} ถึง ${formatDateBE(data.date_to)} ยังไม่มีบิลขายสักใบ เมื่อเริ่มขาย กราฟจะขึ้นที่นี่เอง`}
      />
    );
  }

  const points = linePoints(
    rows.map((row) => row.satang),
    max,
  );
  const peak = rows.reduce((best, row) => (row.satang > best.satang ? row : best), rows[0]);
  // The API decides which day is busiest, ties and all — recomputing it here
  // would be a second opinion that could disagree with the table below.
  const busiestIndex = rows.findIndex((row) => row.day.date === data.busiest_day);
  const busiest = busiestIndex === -1 ? null : rows[busiestIndex];

  const sold = rows.filter((row) => row.satang > 0);
  const quietDays = rows.length - sold.length;
  const totalBills = rows.reduce((sum, row) => sum + row.day.sale_count, 0);
  const middle = rows[Math.floor((rows.length - 1) / 2)];

  return (
    <figure className="m-0">
      <figcaption className="mb-2 text-sm text-slate-600">{caption}</figcaption>

      <div className="max-w-2xl">
        <p className={LABEL_TEXT}>สูงสุด {formatMoney(peak.day.total_amount)} บาท</p>

        <svg
          viewBox={`0 0 ${LINE_WIDTH} ${LINE_HEIGHT}`}
          className="w-full"
          role="img"
          aria-label={`${caption} สูงสุด ${formatMoney(peak.day.total_amount)} บาท เมื่อ ${formatDateBE(peak.day.date)}`}
        >
          {/* The top of the scale, so the highest point has something to be
              high against. The number for it is the label above. */}
          <line
            x1={LINE_LEFT}
            y1={LINE_TOP}
            x2={LINE_RIGHT}
            y2={LINE_TOP}
            stroke="#e2e8f0"
            strokeWidth="1"
            strokeDasharray="4 4"
          />

          {/* The shaded band is decoration; the line above it says everything. */}
          <path d={areaPath(points)} fill="#dbeafe" />
          <polyline
            points={polylinePoints(points)}
            fill="none"
            stroke="#1d4ed8"
            strokeWidth="2.5"
            strokeLinejoin="round"
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
          />

          {busiest && busiestIndex !== -1 ? (
            <g>
              <line
                x1={points[busiestIndex].x}
                y1={LINE_TOP}
                x2={points[busiestIndex].x}
                y2={LINE_BASELINE}
                stroke="#94a3b8"
                strokeWidth="1"
                strokeDasharray="3 3"
              />
              <circle
                cx={points[busiestIndex].x}
                cy={points[busiestIndex].y}
                r="6"
                fill="white"
                stroke="#1d4ed8"
                strokeWidth="2.5"
              />
            </g>
          ) : null}

          {rows.map((row, index) =>
            row.satang > 0 ? (
              <circle
                key={row.day.date}
                cx={points[index].x}
                cy={points[index].y}
                r="3"
                fill="#1d4ed8"
              />
            ) : null,
          )}

          {/* The zero line, solid and drawn last so nothing sits on top of it.
              A day with no sales touches it instead of breaking the line, so
              "no sales" reads as zero. */}
          <line
            x1={LINE_LEFT}
            y1={LINE_BASELINE}
            x2={LINE_RIGHT}
            y2={LINE_BASELINE}
            stroke="#64748b"
            strokeWidth="1.5"
          />
        </svg>

        <div className={`flex justify-between gap-2 ${LABEL_TEXT}`}>
          <span>{formatDateBE(data.date_from)}</span>
          {rows.length > 2 ? <span>{formatDateBE(middle.day.date)}</span> : null}
          {rows.length > 1 ? <span>{formatDateBE(data.date_to)}</span> : null}
        </div>

        <p className={`mt-1 ${LABEL_TEXT}`}>
          เส้นล่างสุดของกราฟ = 0 บาท · วันที่ไม่มีการขายจะแตะเส้นนี้
        </p>
      </div>

      {/* Said in words, because a ring on a dot is not a fact anyone can read
          off the drawing on a phone (D34). */}
      <p className="mt-3 text-sm text-slate-700">
        ขายได้ {sold.length} วัน จาก {rows.length} วัน · รวม{" "}
        <MoneyText value={data.total_amount} withUnit /> · {totalBills} บิล
        {busiest ? (
          <>
            {" · ขายดีที่สุด "}
            {formatDateBE(busiest.day.date)}{" "}
            <MoneyText value={busiest.day.total_amount} withUnit />
          </>
        ) : null}
      </p>

      {/* The table is the content, not a legend. Only the days that had sales
          are listed — the rest are counted on their own row, so the number of
          quiet days is a fact on the page and not something to infer from a
          flat stretch of line. */}
      <table className="mt-3 w-full text-sm">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr className="border-b border-slate-200 text-left text-slate-500">
            <th scope="col" className="py-1 font-medium">
              วันที่
            </th>
            <th scope="col" className="py-1 text-right font-medium">
              บิล
            </th>
            <th scope="col" className="py-1 text-right font-medium">
              ยอดขาย
            </th>
          </tr>
        </thead>
        <tbody>
          {[...sold].reverse().map((row) => (
            <tr key={row.day.date} className="border-b border-slate-100">
              <th scope="row" className="py-2 pr-2 text-left font-normal text-slate-800">
                {formatDateBE(row.day.date)}
                {row.day.date === data.busiest_day ? (
                  <span className="ml-2 rounded bg-blue-50 px-1.5 py-0.5 text-xs text-blue-800">
                    ขายดีที่สุด
                  </span>
                ) : null}
              </th>
              <td className="py-2 text-right tabular-nums">{row.day.sale_count}</td>
              <td className="py-2 text-right tabular-nums">
                <MoneyText value={row.day.total_amount} />
              </td>
            </tr>
          ))}
          {quietDays > 0 ? (
            <tr className="border-b border-slate-100 text-slate-500">
              <th scope="row" className="py-2 pr-2 text-left font-normal">
                ไม่มีการขาย {quietDays} วัน
              </th>
              <td className="py-2 text-right tabular-nums">0</td>
              <td className="py-2 text-right tabular-nums">0.00</td>
            </tr>
          ) : null}
          <tr className="font-medium">
            <th scope="row" className="py-2 pr-2 text-left">
              รวม {rows.length} วัน
            </th>
            <td className="py-2 text-right tabular-nums">{totalBills}</td>
            <td className="py-2 text-right tabular-nums">
              <MoneyText value={data.total_amount} withUnit />
            </td>
          </tr>
        </tbody>
      </table>
    </figure>
  );
}
