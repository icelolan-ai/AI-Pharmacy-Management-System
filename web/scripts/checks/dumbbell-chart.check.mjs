/** U-7 Dumbbell: the delivery note against what was counted.
 *
 *  D35 — drawn by hand in SVG, never by a package. source-rules.check.mjs
 *  guards the dependency list; this file guards that the drawing really is
 *  SVG rather than, say, an image fetched from somewhere.
 *
 *  D45 — not one word inside the <svg>. The drawing scales to its container
 *  and text scales with it, so a label sized to read on a phone comes out
 *  bigger than the section heading on a wide screen, and one sized for the
 *  screen is unreadable on the phone. Every label is HTML beside the drawing.
 *
 *  D34 — every dot carries its number, the two ends differ by fill as well as
 *  position, and each row's outcome is spelled out in words. A reader who
 *  cannot separate the colours must still get the whole story.
 *
 *  And the rule Chat A set for all three charts: with nothing to show, say so.
 *  An empty frame or an invented line is not allowed.
 *
 *  Rewritten to D43-a and D43-c: the placement and the wording are lifted out
 *  of the source and run rather than copied into this file, and every element
 *  is matched whole with an assertion that the match found something. The
 *  previous version carried its own copy of the arithmetic — which proves
 *  only that the copy agrees with itself — and sliced the file between two
 *  markers to reach the drawing.
 */

import { createChecker, source } from "./lib.mjs";

const check = createChecker("U-7 Dumbbell — ใบส่งของ เทียบ รับจริง");

const geometry = source("lib/charts/dumbbell.ts");
const chart = source("components/charts/DumbbellChart.tsx");
const page = source("app/(app)/history/purchases/[id]/page.tsx");

function element(label, text, pattern) {
  const found = text.match(pattern)?.[0] ?? "";
  check.ok(`อ่าน${label}ออกมาได้จริง`, found !== "", "nothing to assert against");
  return found;
}

// --- 1. the REAL placement and the REAL wording, lifted and run -----------
function loadRealGeometry() {
  const rewrites = [
    [
      "export function trackX(value: number, largest: number): number {",
      "function trackX(value, largest) {",
    ],
    [
      "export function outcomeText(expected: number, actual: number | null, unit: string): string {",
      "function outcomeText(expected, actual, unit) {",
    ],
  ];
  let body = geometry;
  for (const [from, to] of rewrites) {
    if (!body.includes(from)) throw new Error(`signature moved in dumbbell.ts: ${from}`);
    body = body.replace(from, to);
  }
  body = body.replace(/^export const /gm, "const ");
  return new Function(`${body}
return { trackX, outcomeText, DUMBBELL_WIDTH, DUMBBELL_TRACK_HEIGHT,
         TRACK_Y, TRACK_LEFT, TRACK_RIGHT };`)();
}

const G = loadRealGeometry();

// Known answers first: if the lift produced something that runs but is not
// the real code, everything below would be meaningless.
check.eq("ยกโค้ดวางจุดจริงออกมารันได้ ไม่ใช่สำเนาในไฟล์นี้", G.trackX(0, 20), G.TRACK_LEFT);
check.eq("ค่ามากสุดอยู่ขวาสุดของราง", G.trackX(20, 20), G.TRACK_RIGHT);
check.eq(
  "ครึ่งหนึ่งอยู่กลางราง",
  G.trackX(10, 20),
  (G.TRACK_LEFT + G.TRACK_RIGHT) / 2,
);
check.ok(
  "ทุกแถวใช้สเกลเดียวกัน จึงเทียบข้ามแถวได้",
  G.trackX(10, 20) === G.trackX(5, 10),
  "a per-row scale makes a shortfall of two look like a shortfall of two hundred",
);
check.ok(
  "จุดไม่ล้นออกนอกราง แม้ค่าจะเกินหรือติดลบ",
  [-5, 0, 1, 7, 19, 20, 999].every(
    (v) => G.trackX(v, 20) >= G.TRACK_LEFT && G.trackX(v, 20) <= G.TRACK_RIGHT,
  ),
);
check.eq(
  "ทุกจำนวนเป็นศูนย์ ก็ยังได้ตัวเลขจริง ไม่ใช่ NaN",
  G.trackX(0, 0),
  G.TRACK_LEFT,
);

check.eq("รับครบ: บอกว่าตรงกับใบส่งของ", G.outcomeText(20, 20, "กล่อง"), "ตรงกับใบส่งของ");
check.eq("รับขาด: บอกจำนวนที่ขาดเป็นตัวเลขพร้อมหน่วย", G.outcomeText(20, 18, "กล่อง"), "ขาด 2 กล่อง");
check.eq("รับเกิน: บอกจำนวนที่เกินเป็นตัวเลขพร้อมหน่วย", G.outcomeText(10, 12, "แผง"), "เกิน 2 แผง");
check.eq("ยังไม่ได้นับ: บอกตรง ๆ ไม่เดาแทน", G.outcomeText(5, null, "ขวด"), "ยังไม่ได้นับ");
check.ok(
  // A receipt nobody has counted must never read as if it matched: the shop
  // would be signing off on a delivery it never checked.
  "ยังไม่ได้นับ ต้องไม่ถูกอ่านว่าตรงกับใบส่งของ",
  G.outcomeText(5, null, "ขวด") !== G.outcomeText(5, 5, "ขวด"),
);
check.eq("รับเป็นศูนย์ ไม่ใช่ 'ยังไม่ได้นับ'", G.outcomeText(4, 0, "ขวด"), "ขาด 4 ขวด");

// --- 2. D45: no words inside the drawing ---------------------------------
check.ok(
  "ไม่มีข้อความอยู่ใน <svg> เลย",
  !/<text\b/.test(chart),
  "D45: text in a drawing that scales has a size nobody chose",
);
const labelSize = /const LABEL_TEXT = "([^"]*)"/.exec(chart)?.[1] ?? "";
check.ok("อ่านขนาดป้ายกำกับออกมาได้จริง", labelSize !== "", "nothing to assert against");
check.ok(
  "ป้ายกำกับใช้ขนาดตัวอักษรปกติ ไม่ใช่ขนาดเล็กสุดที่พอใส่ได้",
  /\btext-sm\b|\btext-base\b/.test(labelSize) && !/\btext-xs\b/.test(labelSize),
  `LABEL_TEXT = "${labelSize}"`,
);
check.ok(
  "ป้ายรอบกราฟหลายอันใช้ขนาดเดียวกัน",
  (chart.match(/\$\{LABEL_TEXT\}|className=\{LABEL_TEXT\}/g) ?? []).length >= 3,
);

// --- 3. the drawing itself ------------------------------------------------
const track = element(
  "รางของแต่ละแถว",
  chart,
  /<svg\s+viewBox=\{`0 0 \$\{DUMBBELL_WIDTH\}[\s\S]*?<\/svg>/,
);
const trackLines = track.match(/<line[\s\S]*?\/>/g) ?? [];
check.eq("รางมีสองเส้น: เส้นฐาน และช่วงที่ต่างกัน", trackLines.length, 2);
check.ok(
  // The shop owner looked at the first version and said it read oddly. The
  // cause: each row drew only the segment between its two dots, so a dot sat
  // in mid-air with no extent to judge it against, and a row whose numbers
  // agreed showed a single dot and no line at all.
  "เส้นฐานพาดเต็มความกว้างของราง ให้จุดมีที่อ้างอิง",
  /x1=\{TRACK_LEFT\}/.test(trackLines[0] ?? "") && /x2=\{TRACK_RIGHT\}/.test(trackLines[0] ?? ""),
  trackLines[0],
);
const widthOf = (markup) => Number(/strokeWidth="([\d.]+)"/.exec(markup ?? "")?.[1] ?? 0);
check.ok(
  "ช่วงที่ขาด/เกิน วาดหนากว่าเส้นฐาน จึงเห็นว่าห่างกันแค่ไหน",
  widthOf(trackLines[1]) > widthOf(trackLines[0]) && widthOf(trackLines[0]) > 0,
  `baseline ${widthOf(trackLines[0])} vs gap ${widthOf(trackLines[1])}`,
);
const trackCircles = track.match(/<circle[\s\S]*?\/>/g) ?? [];
check.eq("รางมีสองจุด: ตามใบส่งของ และรับจริง", trackCircles.length, 2);
check.ok(
  "สองข้างต่างกันที่การเติมสี ไม่ใช่แค่เฉดสี",
  /fill="white"/.test(trackCircles[0] ?? "") && /fill="#0f172a"/.test(trackCircles[1] ?? ""),
  trackCircles.join(" | "),
);
check.ok(
  "จุด 'รับจริง' ไม่ถูกวาดตอนที่ยังไม่ได้นับ",
  /actualX !== null \?/.test(track),
  "a dot drawn at zero would read as a delivery that arrived empty",
);
check.ok("รางมีคำอธิบายสำหรับโปรแกรมอ่านหน้าจอ", /role="img"/.test(track) && /aria-label=\{`/.test(track));

// --- 4. D35: really inline SVG -------------------------------------------
check.ok("วาดด้วย <svg> จริงในไฟล์", /<svg\b/.test(chart));
check.ok("ใช้รูปทรง SVG พื้นฐาน ไม่ใช่รูปภาพ", /<circle\b/.test(chart) && /<line\b/.test(chart));
check.ok(
  "ไม่ได้ดึงกราฟมาเป็นรูปหรือ iframe",
  // <image> is an SVG element and "<img" is NOT a prefix of it — i-m-a-g-e —
  // so it has to be named outright, along with the other ways to paste a
  // picture where a drawing should be.
  !/<img\b|<image\b|<use\b|<foreignObject\b|<iframe|background-image|url\(/.test(chart),
);
check.ok(
  "ไม่มี import จาก library กราฟ",
  !/from "(recharts|chart\.js|d3|victory|nivo|apexcharts|plotly|echarts)/.test(chart) &&
    !/from "(recharts|chart\.js|d3|victory|nivo|apexcharts|plotly|echarts)/.test(geometry),
);

// --- 5. no data means a sentence, not an empty chart ----------------------
const noRows = element("ทางออกกรณีไม่มีรายการ", chart, /if \(rows\.length === 0\) \{[\s\S]*?\n  \}/);
check.ok("ไม่มีรายการ -> ขึ้นข้อความ ไม่วาดกราฟเปล่า", /EmptyState/.test(noRows), noRows);
const noCount = element(
  "ทางออกกรณียังไม่ได้นับ",
  chart,
  /if \(counted\.length === 0\) \{[\s\S]*?\n  \}/,
);
check.ok(
  "ยังไม่ได้นับสักรายการ -> บอกเหตุผล ไม่วาดเส้นสมมติ",
  /EmptyState/.test(noCount) && !/<svg/.test(noCount),
  "Chat A: with nothing to show, say so plainly",
);
check.ok(
  "หารด้วยศูนย์ไม่ได้ แม้ทุกจำนวนเป็น 0",
  /Math\.max\([\s\S]{0,120}, 1\)/.test(chart),
);

// --- 6. D34: numbers and words, never colour alone -----------------------
check.ok(
  "ทั้งสองจำนวนเขียนเป็นตัวเลขให้อ่าน ไม่ใช่มีแต่จุด",
  /ใบส่งของ \{row\.expected\}/.test(chart) && /รับจริง \{row\.actual/.test(chart),
  "D34: a dot with no number says nothing to someone who cannot see the fill",
);
check.ok("หน่วยนับอยู่คู่กับตัวเลขที่อ่าน", /\{row\.unit\}/.test(chart));
check.ok("ผลของแต่ละแถวเขียนเป็นข้อความ", /\{outcome\}/.test(chart));
check.ok(
  "ผลของแต่ละแถวมาจากฟังก์ชันเดียวกับที่เทสต์รัน",
  /outcomeText\(row\.expected, row\.actual, row\.unit\)/.test(chart),
  "a second wording written inline could disagree with the one under test",
);
check.ok(
  "มีคำอธิบายบอกว่าวงกลมกลวงและวงกลมทึบคืออะไร",
  /วงกลมกลวง = ตามใบส่งของ/.test(chart) && /วงกลมทึบ = รับจริง/.test(chart),
  "D34: the two ends must be separable without relying on colour",
);
check.ok("รายการที่ไม่ตรงมีเครื่องหมายเตือนคู่กับข้อความ", /⚠️/.test(chart));
check.ok(
  "บอกไว้ว่าทุกแถวใช้สเกลเดียวกัน และปลายรางคือเท่าไร",
  /ซ้ายสุด = 0/.test(chart) && /ขวาสุด = \{largest\}/.test(chart),
);

// --- 7. it scales without stretching out of shape ------------------------
check.ok(
  "กว้างเต็มพื้นที่แต่ไม่ยืดจนเกินอ่านสบาย",
  /max-w-2xl/.test(chart),
  "wider screens only make the tracks longer, never the text",
);
check.ok("ใช้ viewBox จึงขยายได้ไม่แตก", /viewBox=\{`0 0 \$\{DUMBBELL_WIDTH\}/.test(chart));

// --- 8. wired to the page, and fed from the API ---------------------------
check.ok(
  "สเกลคิดจากทุกแถว ไม่ใช่แถวเดียว",
  /const largest = Math\.max\(\.\.\.rows\.map\(/.test(chart),
  "a scale taken from one row makes every other row's gap the wrong size",
);
check.ok(
  "ใบรับสินค้าแสดงกราฟนี้",
  // Followed by whitespace or '>': plain /<DumbbellChart/ also matched
  // <DumbbellChartDisabled, so unplugging the chart went unnoticed.
  /<DumbbellChart[\s>]/.test(page),
);
check.ok(
  "ตัวเลขมาจาก API ตรง ๆ ไม่ได้คำนวณรวมเองในเบราว์เซอร์",
  /expected: item\.quantity_invoiced/.test(page) && /actual: receivedQuantity\(item\)/.test(page),
  "the rule for every chart: the browser plots, it does not total",
);
check.ok(
  // 03-api-spec.md 411: a null counted quantity means the line was taken as
  // invoiced. Reading the raw field instead labelled a confirmed receipt
  // "ยังไม่ได้นับ", which is not what the shop was charged for.
  "จำนวนที่รับจริงใช้กติกาเดียวกับตาราง (null = รับตามใบส่งของ)",
  /actual: receivedQuantity\(item\)/.test(page) && /value=\{receivedQuantity\(item\)\}/.test(page),
  "the table and the chart must not disagree about the same line",
);
check.ok("หน่วยนับส่งมาด้วย ผลต่างจึงอ่านออกว่าขาดกี่อะไร", /unit: item\.unit/.test(page));
check.ok("ไม่มีการบวกหรือรวมยอดในคอมโพเนนต์กราฟ", !/reduce\(|\.sum\(/.test(chart));

process.exit(check.done() ? 1 : 0);
