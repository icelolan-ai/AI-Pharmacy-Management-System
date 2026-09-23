/** U-7 Pie (D42): สัดส่วนมูลค่าสต็อกแยกตามระดับความเสี่ยงวันหมดอายุ
 *
 *  Three rules decide the shape of this one.
 *
 *  D42 — the four shares are summary.stock_value straight from the API.
 *  Adding up the loaded `items` instead would miss everything past the first
 *  page, which is the mistake already made once with the "เงินจม" percentage.
 *
 *  D42 again — the column has to add to exactly 100. Rounding each share on
 *  its own gives 33/33/33, and a pie whose own labels disagree with itself is
 *  worse than no pie.
 *
 *  D34 — a wedge may not be identified by its colour. The table beside the
 *  circle names every slice with its money and its share, and that table is
 *  the content; the drawing only shows proportion at a glance.
 */

import { createChecker, source } from "./lib.mjs";

const check = createChecker("U-7 Pie — สัดส่วนมูลค่าสต็อกตามความเสี่ยง");

const chart = source("components/charts/PieChart.tsx");
const percent = source("lib/format/percent.ts");
const dashboard = source("app/(app)/dashboard/page.tsx");

// --- 1. the REAL percentage helper, lifted out of the source and run ------
//
// An earlier draft copied the algorithm into this file and tested the copy.
// Four mutations to percent.ts then sailed through — rounding every share on
// its own, deleting the divide-by-zero guard, breaking ties at random, and
// swapping floor for round — because nothing here was reading the real code.
// So the function is now pulled out of the file and executed. If its shape
// changes enough that this stops working, the check fails loudly, which is
// the right outcome.
function loadRealHelper() {
  const from = percent.indexOf("export function wholePercentShares");
  if (from === -1) throw new Error("wholePercentShares is gone from percent.ts");
  const body = percent
    .slice(from)
    .replace(
      "export function wholePercentShares(shares: readonly Share[]): Map<string, number> {",
      "function wholePercentShares(shares) {",
    )
    // The only other TypeScript left in the body is the generic on new Map.
    .replace(/new (Map|Set)<[^>]*>/g, "new $1");
  // Exact satang, the same rule money.ts uses; no float parsing.
  const toSatang = (value) => {
    const [whole, fraction = ""] = String(value).split(".");
    return Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  };
  return new Function("toSatang", `${body}
return wholePercentShares;`)(toSatang);
}

const wholePercentShares = loadRealHelper();
const baht = (satang) => (satang / 100).toFixed(2);
const share = (key, satang) => ({ key, value: baht(satang) });

// If the lift above ever silently produced something that runs but is not the
// real algorithm, every assertion below would be meaningless. One known
// answer, checked first.
check.eq(
  "ยกฟังก์ชันจริงออกมารันได้ ไม่ใช่สำเนาในไฟล์นี้",
  [...wholePercentShares([share("a", 5000), share("b", 5000)]).values()],
  [50, 50],
);

const sumOf = (map) => [...map.values()].reduce((a, b) => a + b, 0);

check.eq(
  "สามส่วนเท่ากัน รวมได้ 100 พอดี ไม่ใช่ 99",
  sumOf(wholePercentShares([
    share("a", 100), share("b", 100), share("c", 100),
  ])),
  100,
);
check.eq(
  "เจ็ดส่วนเท่ากัน ก็ยังรวมได้ 100",
  sumOf(wholePercentShares(Array.from({ length: 7 }, (_, i) => share(`k${i}`, 1)))),
  100,
);
check.eq(
  "สี่ระดับความเสี่ยงตามของจริง รวมได้ 100",
  sumOf(wholePercentShares([
    share("critical", 3333), share("high_risk", 3333), share("warning", 3333), share("normal", 1),
  ])),
  100,
);
check.eq(
  "ส่วนที่ใหญ่กว่าต้องไม่ได้เปอร์เซ็นต์น้อยกว่าส่วนที่เล็กกว่า",
  (() => {
    const shares = [
      share("big", 9000),
      share("small", 1000),
    ];
    const map = wholePercentShares(shares);
    return map.get("big") >= map.get("small");
  })(),
  true,
);
check.eq(
  "มูลค่าเป็นศูนย์ทั้งหมด -> ทุกส่วนเป็น 0 ไม่ใช่ NaN",
  [...wholePercentShares([
    share("a", 0), share("b", 0),
  ]).values()],
  [0, 0],
);
check.eq(
  "ส่วนเดียวกินทั้งวง = 100%",
  [...wholePercentShares([share("only", 500)]).values()],
  [100],
);
check.eq(
  // 20.6 · 20.6 · 20.6 · 19.6 · 18.6 — every share wants to round up. Floor
  // first then hand out the leftover gives 100; rounding each one instead
  // gives 102 and the leftover loop, which only ever adds, cannot claw it
  // back. The earlier cases all summed to 100 either way, so this mutation
  // slipped until the case existed.
  "หลายส่วนปัดขึ้นพร้อมกัน ก็ยังรวมได้ 100 ไม่ใช่ 102",
  sumOf(wholePercentShares([
    share("a", 2060),
    share("b", 2060),
    share("c", 2060),
    share("d", 1960),
    share("e", 1860),
  ])),
  100,
);
check.ok(
  "ผลลัพธ์เดิมทุกครั้งสำหรับข้อมูลเดียวกัน",
  (() => {
    const input = [
      share("a", 1),
      share("b", 1),
      share("c", 1),
    ];
    const first = JSON.stringify([...wholePercentShares(input)]);
    return first === JSON.stringify([...wholePercentShares(input)]);
  })(),
  "a tie broken at random would redraw the chart differently on every render",
);

// --- 2. the helper really is largest-remainder, and works in satang -------
check.ok(
  "ปัดเศษแบบ largest remainder ไม่ใช่ปัดทีละส่วน",
  /leftover/.test(percent) && /remainder/.test(percent),
);
check.ok(
  "คิดเป็นสตางค์ ไม่ผ่าน parseFloat",
  // The call, not the word: the file's own comment says money is never put
  // through parseFloat, and matching bare "parseFloat" failed on that comment
  // while the code was perfectly correct. Same trap as the menu label.
  /toSatang\(/.test(percent) && !/parseFloat\(|Number\(share\.value\)/.test(percent),
  "money is never parsed as a float in this project",
);

// --- 3. D42: the shares come from the API summary, not from items --------
check.ok(
  "ใช้ summary.stock_value จาก API ตรง ๆ",
  /summary\[risk\]\?\.stock_value/.test(dashboard),
);
check.ok(
  "ไม่ได้บวกเองจาก items ที่โหลดมา",
  !/expiringRows[\s\S]{0,80}(reduce|sumMoney)/.test(dashboard),
  "D42: summing the loaded items misses everything past the first page",
);
check.ok(
  "ครบทั้งสี่ระดับ เรียงตาม RISK_ORDER",
  /RISK_ORDER\.map\(\(risk\) => \(\{/.test(dashboard),
);
check.ok("หน้าภาพรวมร้านแสดงกราฟวงกลมนี้", /<PieChart[\s>]/.test(dashboard));

// --- 4. D35: drawn by hand ------------------------------------------------
check.ok("วาดด้วย <svg> และ <path> จริง", /<svg\b/.test(chart) && /<path\b/.test(chart));
check.ok(
  "ไม่ได้ยัดรูปหรือ iframe มาแทนการวาด",
  !/<img\b|<image\b|<use\b|<foreignObject\b|<iframe|background-image|url\(/.test(chart),
);
check.ok(
  "ไม่มี import จาก library กราฟ",
  !/from "(recharts|chart\.js|d3|victory|nivo|apexcharts|plotly|echarts)/.test(chart),
);
check.ok(
  "วงเต็ม 100% วาดด้วยสองส่วนโค้ง ไม่ใช่ส่วนโค้งเดียวที่ยุบ",
  /to - from >= 1/.test(chart),
  "one arc from a point back to itself collapses and draws nothing",
);

// --- 5. D34: the table is the content, not a colour key ------------------
check.ok(
  "มีตารางบอกชื่อระดับ มูลค่า และสัดส่วน",
  /<table\b/.test(chart) && /ระดับ/.test(chart) && /มูลค่า/.test(chart) && /สัดส่วน/.test(chart),
  "D34: a colour legend alone leaves the chart unreadable",
);
check.ok(
  "ทุกแถวมีทั้งจำนวนเงินและเปอร์เซ็นต์",
  /<MoneyText value=\{slice\.value\}/.test(chart) && /percent\.get\(slice\.key\)/.test(chart),
);
check.ok(
  "จุดสีในตารางเป็นของประกอบ ไม่ใช่ตัวบอกความหมาย",
  /aria-hidden="true"[\s\S]{0,140}backgroundColor: slice\.fill/.test(chart),
);
check.ok("กราฟมีคำอธิบายสำหรับโปรแกรมอ่านหน้าจอ", /role="img"/.test(chart) && /aria-label=\{caption\}/.test(chart));
check.ok(
  "ไม่มีมูลค่า -> บอกตรง ๆ ไม่วาดวงเปล่า",
  /total <= 0[\s\S]{0,120}EmptyState/.test(chart),
);
check.ok(
  "แถวรวมแสดง 100% กำกับไว้",
  /100%/.test(chart) && /totalLabel/.test(chart),
);

process.exit(check.done() ? 1 : 0);
