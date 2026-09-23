/** U-8.3 — หน้าผังร้าน อ่านอย่างเดียว
 *
 *  Three rules shape this page, and one of them is the whole point of U-8.
 *
 *  The map is an option, not a system. Nothing on the path of scanning,
 *  receiving or selling may depend on it. This file fails if any of those
 *  screens starts importing it.
 *
 *  D45 — not one word inside the <svg>. The markers are HTML placed by
 *  percentage over the drawing, so the code on each one stays the size it was
 *  set to at any width instead of shrinking with the room.
 *
 *  D34 + Chat A's ruling — the tables are the real content and the drawing is
 *  the help. Every point and every shape is named in words; a person can
 *  finish the job without touching the drawing once.
 *
 *  Written to D43-c from the first line: elements matched whole, every match
 *  asserted to have found something.
 */

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { createChecker, SRC, source } from "./lib.mjs";

const check = createChecker("U-8.3 — หน้าผังร้าน");

const drawing = source("components/store-map/StoreMap2D.tsx");
const page = source("app/(app)/store-map/page.tsx");
const client = source("lib/api/store-map.ts");
const layout = source("app/(app)/layout.tsx");

function element(label, text, pattern) {
  const found = text.match(pattern)?.[0] ?? "";
  check.ok(`อ่าน${label}ออกมาได้จริง`, found !== "", "nothing to assert against");
  return found;
}

// --- 1. the map is an option, not a system --------------------------------
//
// The one assertion in this file that would matter at two in the morning.
const MAIN_FLOW = [
  "app/(app)/sell/page.tsx",
  "app/(app)/receiving/page.tsx",
  "app/(app)/stock/page.tsx",
];
for (const path of MAIN_FLOW) {
  const text = source(path);
  check.ok(`อ่าน ${path} ได้จริง`, text.length > 0, "nothing to assert against");
  check.ok(
    `${path} ไม่ได้พึ่งผังร้านเลย`,
    !/store-map|StoreMap/.test(text),
    "U-8 may never become something the main flow needs",
  );
}

// --- 2. D45: no words inside the drawing ----------------------------------
const svg = element("กรอบวาดผัง", drawing, /<svg[\s\S]*?<\/svg>/);
check.ok(
  "ไม่มีข้อความอยู่ในกรอบวาดเลย",
  !/<text\b/.test(svg),
  "D45: text in a drawing that scales has a size nobody controls",
);
check.ok("ห้องกับของวาดด้วย <rect>", /<rect\b/.test(svg));
check.ok(
  "เส้นไม่หนาขึ้นตามการขยาย",
  (svg.match(/vectorEffect="non-scaling-stroke"/g) ?? []).length >= 2,
);
check.ok(
  "ไม่ได้ยัดรูปหรือ iframe มาแทนการวาด",
  !/<img\b|<image\b|<use\b|<foreignObject\b|<iframe|background-image/.test(drawing),
);
check.ok(
  "ไม่มี import จาก library กราฟ/แผนที่",
  !/from "(recharts|chart\.js|d3|leaflet|mapbox|konva|fabric|three)/.test(drawing),
);

// --- 3. the markers are HTML, placed by percentage ------------------------
const markerLayer = element(
  "ชั้นของหมุดบนผัง",
  drawing,
  /<div className="pointer-events-none absolute inset-0"[\s\S]*?<\/div>/,
);
check.ok(
  "หมุดวางด้วยเปอร์เซ็นต์ของขนาดห้อง จึงตรงที่เดิมทุกขนาดจอ",
  /left: `\$\{\(point\.x_mm \/ map\.width_mm\) \* 100\}%`/.test(markerLayer) &&
    /top: `\$\{\(point\.y_mm \/ map\.height_mm\) \* 100\}%`/.test(markerLayer),
  markerLayer.slice(0, 200),
);
check.ok(
  "หมุดอยู่นอก <svg> จึงไม่ถูกย่อตามกรอบวาด",
  !svg.includes("pointer-events-none"),
  "a marker inside the drawing would shrink with it",
);
check.ok("รหัสจุดเขียนบนหมุดเป็นข้อความ", /\{point\.code\}/.test(markerLayer));
const markerClass = /className="([^"]*)"\s*\n\s*style=\{\{/.exec(markerLayer)?.[1] ?? "";
check.ok("อ่านคลาสของหมุดออกมาได้จริง", markerClass !== "", "nothing to assert against");
check.ok(
  // Rendering a marker and then hiding it is the same trap as sr-only: the
  // source reads correctly and the person in front of the screen gets nothing.
  "หมุดมองเห็นได้จริง ไม่ได้ถูกซ่อนไว้",
  !/\bopacity-0\b|\binvisible\b|\bhidden\b|\bsr-only\b/.test(markerClass),
  `class="${markerClass}"`,
);
check.ok(
  // Every marker is a row in the table below; a screen reader should read the
  // table, not a scatter of codes.
  "ชั้นหมุดถูกซ่อนจากโปรแกรมอ่านหน้าจอ เพราะตารางบอกครบแล้ว",
  /aria-hidden="true"/.test(markerLayer) || /aria-hidden="true"/.test(drawing),
);
check.ok("กราฟมีคำอธิบายสำหรับโปรแกรมอ่านหน้าจอ", /role="img"/.test(svg) && /aria-label=\{`/.test(drawing));

// --- 4. no map means words, not an empty room -----------------------------
const emptyBranch = element(
  "ทางออกกรณียังไม่มีผัง",
  page,
  /map === null \? \([\s\S]*?\) : \(/,
);
check.ok(
  "ยังไม่มีผัง -> บอกเป็นข้อความ",
  /EmptyState/.test(emptyBranch) && /ยังไม่มีผังร้าน/.test(emptyBranch),
  emptyBranch.slice(0, 200),
);
check.ok(
  "ยังไม่มีผัง -> ไม่วาดห้องเปล่า",
  !/StoreMap2D|<svg/.test(emptyBranch),
  "an outline with nothing in it reads as a map that failed to load",
);
check.ok(
  "บอกด้วยว่าไม่มีผังก็ทำงานได้ตามปกติ",
  /พิมพ์ชื่อยาหรือยิงบาร์โค้ดได้เหมือนเดิม/.test(page),
);

// --- 5. the tables are the content ----------------------------------------
const pointsTable = element("ตารางจุด", page, /<table[\s\S]*?<\/table>/);
check.ok(
  "ตารางจุดมีครบ รหัส · ชื่อจุด · รายละเอียด · จำนวนยา",
  /รหัส/.test(pointsTable) &&
    /ชื่อจุด/.test(pointsTable) &&
    /รายละเอียด/.test(pointsTable) &&
    /ยาที่จุดนี้/.test(pointsTable),
);
check.ok(
  "ทุกแถวมีชื่อจุดเป็นข้อความ ไม่ใช่แค่รหัสบนผัง",
  /\{point\.name\}/.test(pointsTable) && /\{point\.code\}/.test(pointsTable),
);
check.ok(
  "จำนวนยาใช้ค่าที่ API นับมาให้ ไม่ได้นับเองในเบราว์เซอร์",
  /\{point\.medicine_count\}/.test(pointsTable) && !/\.length \}| \.reduce\(/.test(pointsTable),
);
check.ok(
  "ของในห้องทุกชิ้นมีชื่อเป็นข้อความคู่กับชนิด",
  /\{shape\.label\}/.test(page) && /SHAPE_KIND_LABEL\[shape\.kind\]/.test(page),
  "D34: a colour swatch alone says nothing",
);
check.ok(
  "จุดสีของแต่ละชนิดเป็นของประกอบ ไม่ใช่ตัวบอกความหมาย",
  /aria-hidden="true"[\s\S]{0,200}SHAPE_KIND_FILL\[shape\.kind\]/.test(page),
);
check.ok(
  "ผังไม่มีจุด -> บอกตรง ๆ",
  /points\.length === 0 \?/.test(page) && /ยังไม่มีจุดที่ทำเครื่องหมายไว้/.test(page),
);

// --- 6. read only, and open to every role ---------------------------------
const exported = [...client.matchAll(/export function (\w+)/g)].map((m) => m[1]);
check.ok("อ่านฟังก์ชันใน client ออกมาได้จริง", exported.length > 0, "nothing to assert against");
check.eq("client ของผังอ่านอย่างเดียว มีแค่ getStoreMap", exported, ["getStoreMap"]);
check.ok(
  "หน้านี้ไม่ยิงคำสั่งแก้ไขอะไรเลย",
  !/"post"|"patch"|"delete"|method: "POST"/i.test(page),
);
check.ok(
  // The import is checked as well as the use: a page that merely reaches for
  // the ability table is one edit away from a gate nobody asked for.
  "หน้านี้ไม่มีด่านกั้น role — ทุกคนที่ล็อกอินเปิดได้",
  !/AccessDenied|ABILITIES\.|from "@\/lib\/abilities"|\bcan\(/.test(page),
  "a cashier has to be able to look up where a medicine sits",
);
const menuEntry = element("เมนูผังร้าน", layout, /\{ href: "\/store-map"[^}]*\}/);
check.ok(
  "เมนูผังร้านไม่ผูกกับสิทธิ์ใด ทุก role จึงเห็น",
  !/ability/.test(menuEntry),
  menuEntry,
);

// --- 7. the page really exists where the menu points ----------------------
const routes = readdirSync(join(SRC, "app", "(app)"), { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name);
check.ok("มีโฟลเดอร์หน้า /store-map จริง", routes.includes("store-map"), routes.join(", "));
const errorBranch = element("ทางออกกรณีโหลดไม่สำเร็จ", page, /<ErrorState[\s\S]*?\/>/);
check.ok(
  "หน้าผังใช้ useSection เหมือนหน้าอื่น และมีปุ่มลองใหม่จริง ๆ",
  /useSection/.test(page) && /onRetry=\{view\.reload\}/.test(errorBranch),
  errorBranch,
);

// --- 8. the API client matches what the backend answers -------------------
const backendSchemas = readFileSync(
  join(SRC, "..", "..", "backend", "app", "schemas", "store_map.py"),
  "utf8",
);
const pointType = element("ชนิดข้อมูลของจุดฝั่งเว็บ", client, /export type MapPoint = \{[\s\S]*?\n\};/);
const pointFields = [...pointType.matchAll(/^  (\w+):/gm)].map((m) => m[1]);
const backendPointOut = element("PointOut ฝั่ง backend", backendSchemas, /class PointOut\(BaseModel\):[\s\S]*?(?=\n\nclass )/);
const backendFields = [...backendPointOut.matchAll(/^    (\w+):/gm)].map((m) => m[1]);
check.eq(
  // The mismatch that killed GET /purchases was a field the model declared and
  // the SQL never selected. The same class of mistake between these two files
  // would show as a blank column rather than a 500, which is worse.
  "ฟิลด์ของจุดฝั่งเว็บตรงกับฝั่ง backend ทุกตัว",
  [...pointFields].sort(),
  [...backendFields].sort(),
);

process.exit(check.done() ? 1 : 0);
