/** D78 round 3 — lists and page tops on a phone, as an app (Chat A ก–ฉ,
 *  with the owner's reference pictures: white rounded groups on a soft
 *  grey, a rounded icon tile, bold name, one quiet line, value on the right).
 *
 *  Done first on รับสินค้า and คลังยา as the sample; the shared rules
 *  (description, the "new …" button, F2) hold on every page.
 */

import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { createChecker, SRC, source } from "./lib.mjs";

const check = createChecker("D78 รอบ 3 — รายการแบบแอป iOS · หัวหน้าเรียบ");

const css = source("app/globals.css").replace(/\/\*[\s\S]*?\*\//g, "");
function parse(text) {
  const rules = [];
  const stack = [];
  let buffer = "";
  for (const ch of text) {
    if (ch === "{") {
      stack.push(buffer.trim());
      buffer = "";
    } else if (ch === "}") {
      const head = stack.pop();
      if (head !== undefined && !head.startsWith("@")) {
        const decls = {};
        for (const part of buffer.split(";")) {
          const at = part.indexOf(":");
          if (at > 0) decls[part.slice(0, at).trim()] = part.slice(at + 1).trim();
        }
        rules.push({ at: stack.filter((s) => s.startsWith("@")), selector: head, decls });
      }
      buffer = "";
    } else buffer += ch;
  }
  return rules;
}
const rules = parse(css);
const root = Object.assign({}, ...rules.filter((r) => r.selector === ":root" && r.at.length === 0).map((r) => r.decls));
const phone = (selector) => rules.find((r) => r.selector === selector && r.at.some((a) => /width\s*<\s*40rem/.test(a)));
const px = (value) => parseFloat(value) * (String(value).endsWith("rem") ? 16 : 1);

// --- ฉ. spacing: shared variables (D48), rows ≥ 56px, groups 24px apart ---
check.ok("แถวรายการสูงอย่างน้อย 56px", px(root["--list-row-min"]) >= 56 && phone(".list-row")?.decls["min-height"] === "var(--list-row-min)", root["--list-row-min"]);
check.eq("ระยะห่างระหว่างกลุ่มบนมือถือ 24px จากตัวแปรกลาง", [px(root["--group-gap"]), phone(".page-stack")?.decls.gap], [24, "var(--group-gap)"]);
check.ok(
  "แถวในกลุ่มเดียวกันอยู่ในกล่องมุมโค้งกล่องเดียว คั่นด้วยเส้นบาง ไม่ใช่การ์ดแยก",
  phone(".list-group")?.decls["border-radius"] === "var(--list-radius)" &&
    /border-top:\s*1px solid var\(--list-divider\)/.test(
      Object.entries(phone(".list-row + .list-row::before")?.decls ?? {}).map(([k, v]) => `${k}: ${v}`).join(";"),
    ),
);
const rowRules = [".list-row", ".list-row-title", ".list-row-sub", ".list-row-main", ".list-row-trailing"].map(phone);
check.ok(
  "🔴 ห้ามตัดคำ: ไม่มี ellipsis / ตัดบรรทัด / หักกลางคำทุกที่ในแถว",
  rowRules.every(Boolean) &&
    !rowRules.some((r) =>
      Object.entries(r.decls).some(([k, v]) => /text-overflow|line-clamp/.test(k) || (k === "overflow-wrap" && v === "anywhere") || (k === "white-space" && v === "nowrap")),
    ),
);
check.ok("ตัวหนังสือในแถวไม่ต่ำกว่า 14px (text-sm ขึ้นไป)", ["--text-sm", "--text-base"].includes(phone(".list-row-sub")?.decls["font-size"]?.match(/var\((--[\w-]+)\)/)?.[1]));
check.ok("ค่าด้านขวากว้างไม่เกิน 40% ชื่อได้ที่ก่อน", parseFloat(phone(".list-row-trailing")?.decls["max-width"]) <= 40);

// --- ก. the rows themselves -------------------------------------------------
const table = source("components/common/DataTable.tsx");
check.ok(
  "แถว: ไอคอน · ชื่อตัวหนา · บรรทัดรอง · ค่าด้านขวา · › เมื่อกดเข้าไปได้",
  /className="list-row-icon"/.test(table) && /className="list-row-title"/.test(table) && /className="list-row-sub"/.test(table) &&
    /className="list-row-trailing"/.test(table) && /\{onRowClick \? <ChevronRight aria-hidden="true" className="list-row-chevron" \/> : null\}/.test(table),
);
const receiving = source("app/(app)/receiving/page.tsx");
const stockTable = source("components/stock/StockTable.tsx");
check.eq("หน้าตัวอย่างใช้แถวแบบ iOS: รับสินค้า · คลังยา", [/phoneRow=\{\{/.test(receiving), /phoneRow=\{\{/.test(stockTable)], [true, true]);
check.eq(
  "หน้าตัวอย่างใช้ระยะห่างกลุ่ม",
  [source("app/(app)/receiving/page.tsx"), source("app/(app)/stock/page.tsx")].map((t) => /<div className="page-stack">/.test(t)),
  [true, true],
);
// What left the list is still on the page a row opens — nothing leaves the system.
check.ok("เลขที่ใบส่งของยังอยู่ในหน้าใบรับ", /invoice_no/.test(source("app/(app)/receiving/[id]/page.tsx")));
const stockDetail = source("app/(app)/stock/[id]/page.tsx");
check.ok("หมวด · มูลค่า · ที่ขายไม่ได้แล้ว ยังอยู่ในหน้ารายละเอียดยา", /medicine\.category/.test(stockDetail) && /stockValue=/.test(stockDetail) && /unsellable/.test(source("components/stock/MedicineSummaryCards.tsx")));
check.ok("รายการรับสินค้า: รอโปรไฟล์ด้วยกล่องเทา ไม่ขึ้น \"ยังไม่มีการรับสินค้า\" ก่อนรู้คำตอบ", /\{recent\.loading \|\| !me \? \(/.test(receiving));

// --- ง. the page's "new …" button: one rule on every page -------------------
const header = source("components/common/PageHeader.tsx");
check.ok("ปุ่มหลักเต็มความกว้างบนมือถือ มี + และคำ", /className="primary-action sm:w-auto"/.test(header) && /<Plus aria-hidden="true"/.test(header) && phone(".primary-action")?.decls.width === "100%");
const pages = (function walk(dir, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (entry.name === "page.tsx") out.push(full);
  }
  return out;
})(join(SRC, "app"));
const stray = [];
for (const full of pages) {
  const text = readFileSync(full, "utf8");
  for (const m of text.matchAll(/<PageHeader[\s\S]*?\/>/g)) {
    const action = m[0].match(/action=\{([\s\S]*)\}\s*(?:\/>|\w+=)/)?.[1] ?? "";
    if (/<Button[^>]*>\s*(เพิ่ม[^<]*|[^<]*ใหม่)\s*<\/Button>/.test(action)) stray.push(relative(SRC, full).replace(/\\/g, "/"));
  }
}
check.eq("ไม่มีปุ่ม \"เพิ่ม…/…ใหม่\" ที่ไม่ใช้กติกาเดียวกัน", stray, []);
check.ok("พบหน้าที่ใช้ปุ่มหลัก (ตัวสแกนไม่ได้ว่างเปล่า)", pages.filter((f) => /primaryAction=\{/.test(readFileSync(f, "utf8"))).length >= 3);

// --- จ. the line under the heading ---------------------------------------
check.ok(
  "บรรทัดอธิบายซ่อนบนมือถือ เฉพาะหน้าที่หัวข้อซ้ำแถวบน (หน้ารายละเอียดยังแสดง)",
  /const hideDescription = repeatsTopBar && !keepDescriptionOnPhone;/.test(header) &&
    /hideDescription \? "hidden text-sm text-slate-600 sm:block"/.test(header),
);
check.ok("เวลาอัปเดตของภาพรวมร้านเป็นข้อมูล ไม่ใช่คำอธิบาย: ยังแสดงบนมือถือ", /อัปเดตล่าสุด[\s\S]{0,80}keepDescriptionOnPhone/.test(source("app/(app)/dashboard/page.tsx")));

// --- ข. ค. computer-only words, the second search hint ----------------------
const sell = source("app/(app)/sell/page.tsx");
check.ok(
  "\"กด F2 หรือ Ctrl+Enter\" ไม่ขึ้นบนมือถือ (มือถือไม่มีปุ่ม F2)",
  /<p className="[^"]*\bhidden\b[^"]*\bsm:block\b[^"]*">กด F2 หรือ Ctrl\+Enter<\/p>/.test(sell),
);
check.ok(
  "กล่องเส้นประซ้ำช่องค้นหา: บนมือถือเป็นบรรทัดเบา ๆ บรรทัดเดียว",
  /<p className="[^"]*\bsm:hidden\b[^"]*">ยังไม่มีรายการในบิล<\/p>\s*<div className="hidden sm:block">\s*<EmptyState title="🔍/.test(sell),
);

// --- every page, not only the samples (the owner: "ทำไมไม่แก้ ux ui ตามที่สั่ง") ---
const everyTsx = (function walk(dir, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (entry.name.endsWith(".tsx")) out.push(full);
  }
  return out;
})(SRC);
const rel = (full) => relative(SRC, full).replace(/\\/g, "/");
const tables = [];
for (const full of everyTsx) {
  if (rel(full) === "components/common/DataTable.tsx") continue;
  const text = readFileSync(full, "utf8");
  for (const m of text.matchAll(/<DataTable\b[\s\S]*?\n\s*\/>/g)) tables.push({ where: rel(full), hasRow: /\bphoneRow=\{/.test(m[0]) });
}
check.ok("พบตารางจริงทั่วแอป (ตัวสแกนไม่ได้ว่างเปล่า)", tables.length >= 14, `found ${tables.length}`);
check.eq("🔴 ทุกตารางในแอปเป็นแถวแบบ iOS บนมือถือ ไม่เหลือการ์ดแบบฟอร์ม", tables.filter((t) => !t.hasRow).map((t) => t.where), []);

const oldStacks = pages
  .filter((full) => /return \(\r?\n\s*<div className="space-y-4">/.test(readFileSync(full, "utf8")))
  .map((full) => rel(full));
check.eq("ทุกหน้าใช้ระยะห่างกลุ่มเดียวกัน (page-stack)", oldStacks, []);

check.ok(
  "หน้าหลักซ่อนหัวข้อบนมือถือแม้คำต่างจากแถบบนเล็กน้อย — หน้ารายละเอียดยังแสดง",
  /const repeatsTopBar = route !== null && \(route\.title === title \|\| !route\.pattern\.includes\("\["\)\);/.test(header),
);
const backButtons = [];
for (const full of pages) {
  const text = readFileSync(full, "utf8");
  for (const m of text.matchAll(/<Button(?:=>|[^>])*>\s*กลับไป[^<]*<\/Button>/g)) {
    if (/<PageHeader[\s\S]*$/.test(text.slice(0, m.index)) && !/max-sm:hidden/.test(m[0]) && !/receiving\/\[id\]/.test(rel(full))) {
      backButtons.push(rel(full));
    }
  }
}
check.ok("พบปุ่มกลับไปจริง (ตัวสแกนไม่ได้ว่างเปล่า)", pages.reduce((n, full) => n + [...readFileSync(full, "utf8").matchAll(/<Button(?:=>|[^>])*>\s*กลับไป/g)].length, 0) >= 4);
check.eq("ปุ่ม \"กลับไป…\" ซ้ำกับ ← ซ่อนบนมือถือ", backButtons, []);
check.ok(
  "ช่องกรอก · กล่องแจ้ง · การ์ด มุมโค้งเท่ากันจากตัวแปรกลาง",
  phone('[data-slot="input"],\n  select,\n  textarea')?.decls["border-radius"] === "var(--control-radius)" ||
    rules.some((r) => /\[data-slot="input"\]/.test(r.selector) && r.decls["border-radius"] === "var(--control-radius)" && r.at.length),
);
check.ok("การ์ดบนมือถือใช้เงาบางแทนเส้นขอบ", phone('[data-slot="card"]')?.decls["box-shadow"] === "var(--list-shadow)");
const expiry = source("app/(app)/expiry/page.tsx");
check.ok(
  "ใกล้หมดอายุ: บนมือถือชิปบอกแค่ชื่อระดับ ช่วงวันของระดับที่เลือกอยู่ใต้แถว",
  /<span className="sm:hidden">\{RISK_LABEL\[risk\]\.split\(" \("\)\[0\]\}<\/span>/.test(expiry) && /sm:hidden">\s*<span aria-hidden="true">\{RISK_META\[tab\]\.icon\}<\/span> \{RISK_LABEL\[tab\]\}/.test(expiry),
);

process.exit(check.done() ? 1 : 0);
