/** U-7 Dumbbell: the delivery note against what was counted.
 *
 *  D35 — drawn by hand in SVG, never by a package. no-chart-library.check.mjs
 *  guards the dependency list; this file guards that the drawing really is
 *  SVG rather than, say, an image fetched from somewhere.
 *
 *  D34 — every dot carries its number, the two ends differ by fill as well as
 *  position, and each row's outcome is spelled out in words. A reader who
 *  cannot separate the colours must still get the whole story.
 *
 *  And the rule Chat A set for all three charts: with nothing to show, say so.
 *  An empty frame or an invented line is not allowed.
 */

import { createChecker, source } from "./lib.mjs";

const check = createChecker("U-7 Dumbbell — ใบส่งของ เทียบ รับจริง");

const chart = source("components/charts/DumbbellChart.tsx");
// The legend draws its own two circles with the same fills, so an assertion
// about the dots has to look at the drawing only — checking the whole file
// let a mutation that flattened both dots to one fill pass.
const drawing = chart.slice(chart.indexOf("{rows.map((row, index)"));
const page = source("app/(app)/history/purchases/[id]/page.tsx");

// --- 1. the placement math, modelled as the component does it -------------
const WIDTH = 360;
const TRACK_LEFT = 10;
const TRACK_RIGHT = WIDTH - 10;

function position(value, largest) {
  return TRACK_LEFT + (value / largest) * (TRACK_RIGHT - TRACK_LEFT);
}

function outcome(expected, actual, unit) {
  if (actual === null) return "ยังไม่ได้นับ";
  const difference = actual - expected;
  if (difference === 0) return "ตรงกับใบส่งของ";
  return difference < 0 ? `ขาด ${Math.abs(difference)} ${unit}` : `เกิน ${difference} ${unit}`;
}

check.eq("รับครบ: บอกว่าตรงกับใบส่งของ", outcome(20, 20, "กล่อง"), "ตรงกับใบส่งของ");
check.eq("รับขาด: บอกจำนวนที่ขาดเป็นตัวเลข", outcome(20, 18, "กล่อง"), "ขาด 2 กล่อง");
check.eq("รับเกิน: บอกจำนวนที่เกินเป็นตัวเลข", outcome(10, 12, "แผง"), "เกิน 2 แผง");
check.eq("ยังไม่ได้นับ: บอกตรง ๆ ไม่เดาแทน", outcome(5, null, "ขวด"), "ยังไม่ได้นับ");

check.eq("ค่าศูนย์อยู่ซ้ายสุดของราง", Math.round(position(0, 20)), TRACK_LEFT);
check.eq("ค่ามากสุดอยู่ขวาสุดของราง", Math.round(position(20, 20)), TRACK_RIGHT);
check.eq("ครึ่งหนึ่งอยู่กลางราง", Math.round(position(10, 20)), Math.round((TRACK_LEFT + TRACK_RIGHT) / 2));
check.ok(
  "ทุกแถวใช้สเกลเดียวกัน จึงเทียบข้ามแถวได้",
  position(10, 20) === position(5, 10),
  "a per-row scale would make a small gap look like a large one",
);
check.ok(
  "จุดไม่ล้นออกนอกราง",
  [0, 1, 7, 19, 20].every((v) => position(v, 20) >= TRACK_LEFT && position(v, 20) <= TRACK_RIGHT),
);

// --- 2. no data means a sentence, not an empty chart ----------------------
check.ok(
  "ไม่มีรายการ -> ขึ้นข้อความ ไม่วาดกราฟเปล่า",
  /rows\.length === 0[\s\S]{0,160}EmptyState/.test(chart),
);
check.ok(
  "ยังไม่ได้นับสักรายการ -> บอกเหตุผล ไม่วาดเส้นสมมติ",
  /counted\.length === 0[\s\S]{0,200}EmptyState/.test(chart),
  "Chat A: with nothing to show, say so plainly",
);
check.ok(
  "หารด้วยศูนย์ไม่ได้ แม้ทุกจำนวนเป็น 0",
  /Math\.max\([\s\S]{0,120}, 1\)/.test(chart),
);

// --- 3. D35: really inline SVG -------------------------------------------
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
  !/from "(recharts|chart\.js|d3|victory|nivo|apexcharts|plotly|echarts)/.test(chart),
);

// --- 4. D34: numbers and words, never colour alone -----------------------
check.ok(
  "ทั้งสองจำนวนเขียนเป็นตัวเลขให้อ่าน ไม่ใช่มีแต่จุด",
  /ใบส่งของ \{row\.expected\}/.test(chart)
    && /รับจริง \{row\.actual/.test(chart),
  "D34: a dot with no number says nothing to someone who cannot see the fill",
);
check.ok(
  "ผลของแต่ละแถวเขียนเป็นข้อความ",
  /\{outcome\}/.test(chart) && /ขาด \$\{/.test(chart) && /เกิน \$\{/.test(chart),
);
check.ok(
  "มีคำอธิบายบอกว่าวงกลมกลวงและวงกลมทึบคืออะไร",
  /วงกลมกลวง = ตามใบส่งของ/.test(chart) && /วงกลมทึบ = รับจริง/.test(chart),
  "D34: the two ends must be separable without relying on colour",
);
check.ok(
  "สองข้างต่างกันที่การเติมสี ไม่ใช่แค่เฉดสี",
  /fill="white"/.test(drawing) && /fill="#0f172a"/.test(drawing),
);
check.ok(
  "กราฟมีคำอธิบายสำหรับโปรแกรมอ่านหน้าจอ",
  /role="img"/.test(chart) && /aria-label=\{caption\}/.test(chart),
);
check.ok(
  "รายการที่ไม่ตรงมีเครื่องหมายเตือนคู่กับข้อความ",
  /⚠️/.test(chart),
);

// --- 5. it scales without shrinking the text away ------------------------
check.ok(
  "กว้างเต็มพื้นที่แต่ไม่ยืดจนเกินอ่านสบาย",
  /className="w-full max-w-2xl"/.test(chart),
  "at 375px it lands near 1:1; wider screens only make it larger",
);
check.ok("ใช้ viewBox จึงขยายได้ไม่แตก", /viewBox=\{`0 0 \$\{WIDTH\}/.test(chart));

// --- 6. wired to the page, and fed from the API ---------------------------
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
check.ok(
  "หน่วยนับส่งมาด้วย ผลต่างจึงอ่านออกว่าขาดกี่อะไร",
  /unit: item\.unit/.test(page),
);
check.ok(
  "ไม่มีการบวกหรือรวมยอดในคอมโพเนนต์กราฟ",
  !/reduce\(|\.sum\(/.test(chart),
);

process.exit(check.done() ? 1 : 0);
