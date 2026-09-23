/** U-7 Line: ยอดขายรายวัน 30 วันล่าสุดบนหน้าภาพรวมร้าน
 *
 *  Four rules decide the shape of this one.
 *
 *  D35 — drawn by hand in SVG. No charting package, ever.
 *
 *  Chat A's own rule for this chart — a day with no sales must be visible as
 *  a zero, not as a gap. A line drawn from a list with holes in it slopes
 *  straight from the day before a closure to the day after it and shows trade
 *  that never happened.
 *
 *  Chat A again — with no sales at all the chart says so in words. It may not
 *  draw a flat line through an invented scale, because that looks like an
 *  answer. This shop has almost no sales, so that is the case the owner will
 *  actually see.
 *
 *  D34 — the table beside the drawing is the content, not a legend, and
 *  nothing is carried by colour alone. That was the lesson from the pie.
 *
 *  Written to D43-c from the first line: no slicing between two markers.
 *  Every element is matched whole, and every match is asserted to have found
 *  something before anything is asserted about it.
 */

import { createChecker, source } from "./lib.mjs";

const check = createChecker("U-7 Line — ยอดขายรายวัน");

const geometry = source("lib/charts/line.ts");
const chart = source("components/charts/SalesLineChart.tsx");
const dashboard = source("app/(app)/dashboard/page.tsx");
const client = source("lib/api/reports.ts");

/** Matches `pattern` against `text` and refuses to go on if it found nothing.
 *  D43-c: a matcher that stops matching must fail loudly. Silently asserting
 *  against "" is how a check goes green while testing nothing. */
function element(label, text, pattern) {
  const found = text.match(pattern)?.[0] ?? "";
  check.ok(`อ่าน${label}ออกมาได้จริง`, found !== "", "nothing to assert against");
  return found;
}

// --- 1. the REAL geometry, lifted out of the file and run -----------------
//
// The pie taught this: a copy of the algorithm pasted into the check passed
// four mutations of the original. So the functions are pulled out of the
// source and executed. Every signature the lift rewrites is asserted to have
// been there — if one moves, this throws instead of quietly producing a
// stub that runs and proves nothing.
function loadRealGeometry() {
  const rewrites = [
    [
      "export function linePoints(values: readonly number[], max: number): LinePoint[] {",
      "function linePoints(values, max) {",
    ],
    ["function round(value: number): number {", "function round(value) {"],
    [
      "export function polylinePoints(points: readonly LinePoint[]): string {",
      "function polylinePoints(points) {",
    ],
    [
      "export function areaPath(points: readonly LinePoint[]): string {",
      "function areaPath(points) {",
    ],
    ["export type LinePoint = { x: number; y: number };", ""],
  ];
  let body = geometry;
  for (const [from, to] of rewrites) {
    if (!body.includes(from)) throw new Error(`signature moved in line.ts: ${from}`);
    body = body.replace(from, to);
  }
  body = body.replace(/^export const /gm, "const ");
  return new Function(`${body}
return { linePoints, polylinePoints, areaPath,
         LINE_WIDTH, LINE_HEIGHT, LINE_LEFT, LINE_RIGHT, LINE_TOP, LINE_BASELINE };`)();
}

const G = loadRealGeometry();

// One known answer first. If the lift ever produced something that runs but
// is not the real code, every assertion below would be meaningless.
check.eq(
  "ยกโค้ดวาดเส้นจริงออกมารันได้ ไม่ใช่สำเนาในไฟล์นี้",
  G.linePoints([0, 100], 100),
  [
    { x: G.LINE_LEFT, y: G.LINE_BASELINE },
    { x: G.LINE_RIGHT, y: G.LINE_TOP },
  ],
);

// --- 2. every day gets a point, and a quiet day is a zero -----------------
check.eq(
  "30 วัน ได้ 30 จุด ไม่มีวันไหนหล่นหาย",
  G.linePoints(new Array(30).fill(0), 0).length,
  30,
);
check.eq(
  "วันที่ไม่มีการขายอยู่บนเส้นศูนย์พอดี ไม่ใช่เส้นขาด",
  G.linePoints([50000, 0, 20000], 50000)[1].y,
  G.LINE_BASELINE,
);
check.ok(
  "ทั้งช่วงไม่มีการขายเลย ก็ยังได้ตัวเลขจริง ไม่ใช่ NaN",
  G.linePoints([0, 0, 0], 0).every(
    (point) => Number.isFinite(point.x) && point.y === G.LINE_BASELINE,
  ),
  "dividing by a zero maximum would put every dot at NaN and draw nothing",
);
check.eq(
  "วันเดียวก็วาดได้ ไม่หารด้วยศูนย์",
  G.linePoints([10000], 10000)[0].x,
  G.LINE_WIDTH / 2,
);
check.eq(
  "วันที่ขายได้สูงสุดแตะเส้นบนสุด",
  G.linePoints([1, 100], 100)[1].y,
  G.LINE_TOP,
);
check.eq(
  // Catches a scale swapped for sqrt or log, and catches plotting the index
  // instead of the value: both leave the endpoints right and the middle wrong.
  "ครึ่งหนึ่งของยอดสูงสุดอยู่กึ่งกลางพอดี",
  G.linePoints([50, 100], 100)[0].y,
  (G.LINE_BASELINE + G.LINE_TOP) / 2,
);
check.ok(
  "ไม่มีจุดไหนหลุดต่ำกว่าเส้นศูนย์",
  G.linePoints([-500, 100], 100).every((point) => point.y <= G.LINE_BASELINE),
);
check.ok(
  "วันเรียงจากซ้ายไปขวา เต็มความกว้าง",
  (() => {
    const points = G.linePoints([1, 2, 3, 4, 5], 5);
    const rising = points.every((point, i) => i === 0 || point.x > points[i - 1].x);
    return rising && points[0].x === G.LINE_LEFT && points[4].x === G.LINE_RIGHT;
  })(),
  "a span divided by length instead of length-1 stops short of the right edge",
);

// --- 3. the drawing really carries one coordinate per day -----------------
const drawn = G.polylinePoints(G.linePoints([10, 0, 0, 40, 0], 40));
check.eq("เส้นที่วาดมีพิกัดครบทุกวัน", drawn.split(" ").length, 5);
check.ok(
  "ทุกพิกัดเป็นคู่ x,y จริง",
  drawn.split(" ").every((pair) => /^-?\d+(\.\d+)?,-?\d+(\.\d+)?$/.test(pair)),
  drawn,
);
const area = G.areaPath(G.linePoints([10, 0, 40], 40));
check.ok("แถบใต้เส้นปิดกลับที่เส้นศูนย์", area.endsWith(`L ${G.LINE_RIGHT} ${G.LINE_BASELINE} Z`), area);
check.eq("ไม่มีข้อมูล = ไม่มีแถบ ไม่ใช่ path เพี้ยน", G.areaPath([]), "");

// --- 4. the component uses that code, and does not filter days out -------
check.ok(
  "กราฟใช้โค้ดวาดเส้นตัวเดียวกัน ไม่ได้คำนวณเองซ้ำ",
  /from "@\/lib\/charts\/line"/.test(chart) && /polylinePoints\(points\)/.test(chart),
);
// Two places a day can be dropped, and closing only one of them leaves the
// other open: the list itself, and the call that turns it into dots.
const rowsSource = element("การอ่านรายวันจาก API", chart, /const rows = data\.days[\s\S]*?\);/);
check.ok(
  "รายวันมาจาก data.days ทั้งหมด ไม่ได้กรองตั้งแต่ต้นทาง",
  !/filter/.test(rowsSource),
  rowsSource,
);
const pointsCall = element("การเรียกสร้างจุดของกราฟ", chart, /const points = linePoints\([\s\S]*?\);/);
check.ok(
  "สร้างจุดจากทุกวันที่ API ส่งมา ไม่กรองวันที่ขายไม่ได้ทิ้ง",
  /rows\.map\(/.test(pointsCall) && !/filter/.test(pointsCall),
  "filtering here is exactly how a quiet day turns into a gap",
);
const polyline = element("เส้นกราฟ", chart, /<polyline[\s\S]*?\/>/);
check.ok(
  "เส้นกราฟวาดจากพิกัดที่คำนวณไว้ ไม่ใช่ค่าตายตัว",
  /points=\{polylinePoints\(points\)\}/.test(polyline),
  polyline,
);
check.ok("เส้นกราฟเป็นเส้น ไม่ใช่รูปทึบ", /fill="none"/.test(polyline), polyline);

// --- 5. no sales at all -> words, not a drawing ---------------------------
const emptyGuard = element(
  "ทางออกกรณียังไม่มีการขาย",
  chart,
  /if \(rows\.length === 0 \|\| max <= 0\) \{[\s\S]*?\n  \}/,
);
check.ok(
  "ยังไม่มีการขายเลย -> บอกเป็นข้อความ",
  /EmptyState/.test(emptyGuard) && /ยังไม่มีการขาย/.test(emptyGuard),
  emptyGuard,
);
check.ok(
  "ยังไม่มีการขายเลย -> ไม่วาดเส้นสมมติ",
  !/<svg|<polyline|linePoints\(/.test(emptyGuard),
  "an empty frame or a flat invented line both look like an answer",
);
check.ok(
  "ด่านนี้อยู่ก่อนการคำนวณจุด",
  chart.indexOf("max <= 0") < chart.indexOf("const points = linePoints("),
  "computing a scale from nothing is what produces the invented line",
);

// --- 6. D34: the numbers are on the page, not only in the picture --------
const table = element("ตารางยอดขายรายวัน", chart, /<table[\s\S]*?<\/table>/);
check.ok(
  "ตารางมีครบ วันที่ · บิล · ยอดขาย",
  /วันที่/.test(table) && /บิล/.test(table) && /ยอดขาย/.test(table),
  "D34: a bare line tells an owner nothing they can act on",
);
check.ok(
  "ทุกแถวมีทั้งจำนวนบิลและจำนวนเงิน",
  /row\.day\.sale_count/.test(table) && /<MoneyText value=\{row\.day\.total_amount\}/.test(table),
  table,
);
check.ok(
  "จำนวนวันที่ไม่มีการขายเขียนไว้เป็นตัวเลข",
  /ไม่มีการขาย \{quietDays\} วัน/.test(table),
  "otherwise a flat stretch of line is the only clue, and it is not a number",
);
check.ok("มีแถวรวมทั้งช่วง", /รวม \{rows\.length\} วัน/.test(table), table);
check.ok(
  // Once in the sentence above the table, once as the row's own label. A ring
  // on a dot is not readable on a phone, so the fact lives in words as well.
  "วันที่ขายดีที่สุดบอกเป็นข้อความ ไม่ได้อาศัยแค่วงกลมบนกราฟ",
  (chart.match(/ขายดีที่สุด/g) ?? []).length >= 2,
  `found ${(chart.match(/ขายดีที่สุด/g) ?? []).length}`,
);
const summaryLine = element("บรรทัดสรุปเหนือตาราง", chart, /<p className="mt-3[\s\S]*?<\/p>/);
check.ok(
  // sr-only has slipped past a check in this project before: the source read
  // correctly while the person in front of the screen got nothing.
  "บรรทัดสรุปมองเห็นได้จริง ไม่ได้ซ่อนไว้ให้โปรแกรมอ่านหน้าจอเท่านั้น",
  /ขายดีที่สุด/.test(summaryLine) && !/sr-only|hidden/.test(summaryLine),
  summaryLine,
);
const busiestPick = element("การเลือกวันขายดีที่สุด", chart, /const busiestIndex = [\s\S]*?;\n/);
check.ok(
  // Asserting that "data.busiest_day" appears somewhere in the file is not
  // enough — the table's own badge already says it, so the marker on the
  // drawing could be picked a different way and nothing would notice. On a
  // tie the API takes the later day and findIndex takes the earlier one, so
  // the ring would sit on one day while the badge sat on another.
  "วันที่ขายดีที่สุดใช้คำตอบจาก API ไม่ได้คิดเองให้ขัดกัน",
  /data\.busiest_day/.test(busiestPick),
  busiestPick,
);
check.ok(
  "กราฟมีคำอธิบายสำหรับโปรแกรมอ่านหน้าจอ",
  /role="img"/.test(chart) && /aria-label=\{`/.test(chart),
);
const zeroLine = element("เส้นศูนย์", chart, /<line[^>]*?y1=\{LINE_BASELINE\}[\s\S]*?\/>/);
check.ok(
  "เส้นศูนย์เป็นเส้นแนวนอนจริง ไม่ใช่แค่ขอบล่างของกรอบ",
  /y2=\{LINE_BASELINE\}/.test(zeroLine),
  zeroLine,
);
check.ok(
  "เส้นศูนย์มีป้ายกำกับเป็นตัวเลข",
  /0 บาท/.test(chart),
  "an unlabelled bottom edge is not a zero, it is just an edge",
);
check.ok("มีป้ายบอกยอดสูงสุด", /สูงสุด \{formatMoney\(peak\.day\.total_amount\)\}/.test(chart));

// --- 7. D34 again: text big enough to read on a phone --------------------
const svg = element("กรอบวาดกราฟ", chart, /<svg[\s\S]*?<\/svg>/);
check.ok(
  // The drawing scales to whatever width it is given, and text inside it
  // scales too. At 375px the labels measured under 8px; in a wide column the
  // same labels came out bigger than the heading above them. Neither size is
  // chosen by anyone, which is why none of them may live in here.
  "ไม่มีข้อความอยู่ในกรอบวาด ขนาดตัวอักษรจึงไม่ถูกย่อ/ขยายตามกรอบ",
  !/<text\b/.test(svg),
  "text inside a scaling drawing has no size anyone controls (D34)",
);
const labelSize = /const LABEL_TEXT = "([^"]*)"/.exec(chart)?.[1] ?? "";
check.ok("อ่านขนาดป้ายกำกับออกมาได้จริง", labelSize !== "", "nothing to assert against");
check.ok(
  "ป้ายกำกับใช้ขนาดตัวอักษรปกติ ไม่ใช่ขนาดเล็กสุดที่พอใส่ได้",
  /\btext-sm\b|\btext-base\b/.test(labelSize) && !/\btext-xs\b/.test(labelSize),
  `LABEL_TEXT = "${labelSize}"`,
);
const labelUses = chart.match(/\$\{LABEL_TEXT\}|className=\{LABEL_TEXT\}/g) ?? [];
check.ok(
  // Three labels sit around the drawing: the top of the scale, the dates, and
  // the sentence that says what the bottom line is. All three read the same
  // constant, so shrinking one of them alone is not possible.
  "ป้ายรอบกราฟทุกอันใช้ขนาดเดียวกัน",
  labelUses.length >= 3,
  `found ${labelUses.length}`,
);

// --- 8. D35: drawn by hand ------------------------------------------------
check.ok("วาดด้วย <svg> จริง", /<svg\b/.test(chart));
check.ok(
  "ไม่ได้ยัดรูปหรือ iframe มาแทนการวาด",
  !/<img\b|<image\b|<use\b|<foreignObject\b|<iframe|background-image|url\(/.test(chart),
);
check.ok(
  "ไม่มี import จาก library กราฟ",
  !/from "(recharts|chart\.js|d3|victory|nivo|apexcharts|plotly|echarts)/.test(chart) &&
    !/from "(recharts|chart\.js|d3|victory|nivo|apexcharts|plotly|echarts)/.test(geometry),
);

// --- 9. wired to the right endpoint, on the right page -------------------
check.ok("หน้าภาพรวมร้านแสดงกราฟเส้นนี้", /<SalesLineChart[\s\n]/.test(dashboard));
check.ok(
  "ดึงข้อมูลจาก endpoint ยอดขายรายวัน 30 วัน",
  /getSalesTimeseries\(\{ days: 30, signal \}\)/.test(dashboard),
);
check.ok(
  "กราฟเส้นมีส่วนของตัวเอง ไม่ได้ซ่อนอยู่ในบล็อกอื่น",
  /title="ยอดขายรายวัน \(30 วันล่าสุด\)"/.test(dashboard),
  "nested in another section it disappears whenever that section is empty",
);
const fetcher = element(
  "ฟังก์ชันเรียก API ยอดขายรายวัน",
  client,
  // The closing brace has to be a line of its own: the parameter block ends
  // in "}: {", and a pattern that stops at the first "\n}" ends there, leaving
  // the body — the part worth asserting about — outside the match.
  /export function getSalesTimeseries\([\s\S]*?\n\}\n/,
);
check.ok(
  "เรียก /reports/sales-timeseries ตรง ๆ ไม่แคช",
  /\/api\/v1\/reports\/sales-timeseries/.test(fetcher) && /cache: "no-store"/.test(fetcher),
  fetcher,
);

process.exit(check.done() ? 1 : 0);
