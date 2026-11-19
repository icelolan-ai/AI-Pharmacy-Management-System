/** D82 — the phone app's look, and the blue theme (D71).
 *
 *  1. Contrast, computed from the real values of BOTH themes — Tailwind's
 *     own palette (oklch, converted here) for ขาว, the overrides in
 *     :root[data-theme="blue"] for ฟ้า: every pair of words and what is
 *     behind them must reach D34's 4.5:1.
 *  2. The theme rule, run as the app runs it: a person's own choice beats
 *     อัตโนมัติ; anything unreadable is อัตโนมัติ, never a blank page; the
 *     <head> script that sets it before the first paint is built from the
 *     same function and is run here in a sandbox, storage blocked and all.
 *  3. The theme changes colours only — no size, no spacing, no layout.
 *  4. The bar's raised ขายยา disc keeps its word and follows the permission
 *     to sell; the home page's summary shows nobody more than their role may.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import vm from "node:vm";

import { createChecker, source } from "./lib.mjs";
import { loadTs } from "./load-ts.mjs";

const check = createChecker("D82 — หน้าตาแบบแอป · ธีมฟ้า (D71)");

// --- colour maths --------------------------------------------------------------
const lin = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
function hexToLinear(hex) {
  const h = hex.replace("#", "");
  const full = h.length === 3 ? [...h].map((x) => x + x).join("") : h;
  return [0, 2, 4].map((i) => lin(parseInt(full.slice(i, i + 2), 16) / 255));
}
function oklchToLinear(text) {
  const m = text.match(/oklch\(\s*([\d.]+)(%?)\s+([\d.]+)\s+([\d.]+)/);
  const L = parseFloat(m[1]) / (m[2] === "%" ? 100 : 1);
  const C = parseFloat(m[3]);
  const H = (parseFloat(m[4]) * Math.PI) / 180;
  const a = C * Math.cos(H);
  const b = C * Math.sin(H);
  const l_ = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m_ = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s_ = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [
    4.0767416621 * l_ - 3.3077115913 * m_ + 0.2309699292 * s_,
    -1.2684380046 * l_ + 2.6097574011 * m_ - 0.3413193965 * s_,
    -0.0041960863 * l_ - 0.7034186147 * m_ + 1.707614701 * s_,
  ].map((v) => Math.min(1, Math.max(0, v)));
}
function luminance(value) {
  const rgb = value.startsWith("#") ? hexToLinear(value) : oklchToLinear(value);
  return 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2];
}
function contrast(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

// The converter itself, against a value known from its hex (#62748e).
check.ok("ตัวแปลงสี oklch ถูกต้อง: slate-500 บนขาว ≈ 4.76:1", Math.abs(contrast("oklch(55.4% 0.046 257.417)", "#ffffff") - 4.76) < 0.05);

// --- the two themes' variables ---------------------------------------------------
const css = source("app/globals.css").replace(/\/\*[\s\S]*?\*\//g, "");
const tailwind = readFileSync(join(import.meta.dirname, "..", "..", "node_modules", "tailwindcss", "theme.css"), "utf8");
function declarations(block) {
  const out = {};
  for (const m of block.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) out[m[1]] = m[2].trim();
  return out;
}
const palette = declarations(tailwind);
const rootBlocks = [...css.matchAll(/(^|\n):root\s*\{([^}]*)\}/g)].map((m) => declarations(m[2]));
const white = Object.assign({}, palette, ...rootBlocks);
const blueBlock = css.match(/:root\[data-theme="blue"\]\s*\{([^}]*)\}/)?.[1] ?? "";
const blueOnly = declarations(blueBlock);
const blue = { ...white, ...blueOnly };

// D83: what a phone actually shows — the soft-UI values under (width < 40rem).
// Same precedence as the browser: the global blue block outranks the phone's
// plain :root; the phone's own blue and not-blue blocks outrank both.
const softRaw = source("app/globals.css");
const soft = softRaw.slice(softRaw.indexOf("D83 — soft UI")).replace(/\/\*[\s\S]*?\*\//g, "");
const phoneRoot = declarations(soft.match(/\n {2}:root\s*\{([^}]*)\}/)?.[1] ?? "");
const phoneWhite = declarations(soft.match(/:root:not\(\[data-theme="blue"\]\)\s*\{([^}]*)\}/)?.[1] ?? "");
const phoneBlue = declarations(soft.match(/\n {2}:root\[data-theme="blue"\]\s*\{([^}]*)\}/)?.[1] ?? "");
check.ok(
  "อ่านค่าบนมือถือ (soft UI) ได้จริงทั้งสองธีม",
  Object.keys(phoneRoot).length >= 5 && Object.keys(phoneWhite).length >= 20 && Object.keys(phoneBlue).length >= 10,
  `${Object.keys(phoneRoot).length} / ${Object.keys(phoneWhite).length} / ${Object.keys(phoneBlue).length}`,
);
const whitePhone = { ...white, ...phoneRoot, ...phoneWhite };
const bluePhone = { ...white, ...phoneRoot, ...blueOnly, ...phoneBlue };
check.ok("อ่านค่าธีมฟ้าได้จริง", Object.keys(blueOnly).length >= 30, `${Object.keys(blueOnly).length} values`);

function resolve(theme, name, depth = 0) {
  const value = theme[name];
  if (value === undefined || depth > 10) return undefined;
  const ref = value.match(/^var\((--[\w-]+)\)$/);
  return ref ? resolve(theme, ref[1], depth + 1) : value;
}

// Words, and what they sit on.
const PAIRS = [
  ["--color-slate-900", "--color-white", "ตัวหนังสือหลัก บนการ์ด"],
  ["--color-slate-900", "--page-bg", "ตัวหนังสือหลัก บนพื้นแอป"],
  ["--color-slate-700", "--color-white", "ตัวรอง (700) บนการ์ด"],
  ["--color-slate-600", "--color-white", "ตัวรอง (600) บนการ์ด"],
  ["--color-slate-600", "--page-bg", "ตัวรอง (600) บนพื้นแอป"],
  ["--color-slate-500", "--color-white", "ตัวเบา (500) บนการ์ด"],
  ["--color-slate-500", "--page-bg", "ตัวเบา (500) บนพื้นแอป"],
  ["--color-slate-700", "--seg-bg", "แท็บเม็ดยาที่ไม่ได้เลือก บนราง"],
  ["--color-slate-500", "--surface", "ตัวเบา (500) บนการ์ด/การ์ดนูน"],
  ["--color-slate-600", "--surface", "ตัวรอง (600) บนการ์ดนูน"],
  ["--color-slate-500", "--soft-bg", "ตัวเบา (500) ในช่องกรอกที่บุ๋ม", "phone"],
  ["--muted-foreground", "--soft-bg", "ข้อความตัวอย่างในช่องกรอก", "phone"],
  ["--ink", "--surface", "ปุ่มหลักนูน: คำสีเข้มบนปุ่ม", "phone"],
  ["--ink", "--soft-bg", "ตัวเข้มบนพื้นเทา", "phone"],
  ["--primary-foreground", "--primary", "ตัวหนังสือบนปุ่มหลัก / แท็บที่เลือก"],
  ["--hero-ink", "--hero-bg", "ตัวเลขบนการ์ดเข้ม"],
  ["--hero-ink-soft", "--hero-bg", "คำบรรยายบนการ์ดเข้ม"],
  ["--accent-ink", "--accent-soft", "ไอคอนสีเน้น บนกล่องไอคอน"],
  ["--accent-ink", "--color-white", "สีเน้น บนการ์ด"],
  ["--tab-center-ink", "--tab-center-bg", "ไอคอนบนปุ่มขายยาตรงกลาง"],
  ["--bar-text", "--bar-solid", "ปุ่มที่อยู่ บนแถบ"],
  ["--bar-text-muted", "--bar-solid", "ปุ่มอื่น บนแถบ"],
  ["--color-red-600", "--color-white", "สถานะ วิกฤต"],
  ["--color-orange-700", "--color-white", "สถานะ ใกล้หมดอายุ"],
  ["--color-yellow-700", "--color-white", "สถานะ เฝ้าระวัง"],
  ["--color-green-700", "--color-white", "สถานะ ปกติ"],
  ["--color-amber-700", "--color-white", "คำเตือน ต่ำกว่าจุดสั่งซื้อ"],
];
for (const [name, theme, onPhone] of [["ขาว", white, false], ["ฟ้า", blue, false], ["ขาว บนมือถือ", whitePhone, true], ["ฟ้า บนมือถือ", bluePhone, true]]) {
  const low = [];
  // Pairs marked "phone" exist only in the phone's soft UI (D83).
  for (const [fg, bg, label] of PAIRS.filter((pair) => onPhone || pair[3] !== "phone")) {
    const a = resolve(theme, fg);
    const b = resolve(theme, bg);
    if (!a || !b) {
      low.push(`${label}: ${fg}=${a} ${bg}=${b} (resolve failed)`);
      continue;
    }
    const ratio = contrast(a, b);
    if (ratio < 4.5) low.push(`${label}: ${ratio.toFixed(2)}:1`);
  }
  check.eq(`🔴 ธีม${name}: ทุกคู่ตัวหนังสือ/พื้น ผ่าน 4.5:1 (${PAIRS.length} คู่)`, low, []);
}
check.ok("สีสถานะในหน้าเดิมใช้ orange-700 (600 ได้ 3.6:1 ไม่ผ่าน)", /high_risk: \{[^}]*text-orange-700/.test(source("lib/format/expiry.ts")));

// --- 3. the theme changes colours only ---------------------------------------------
const notColour = Object.keys(blueOnly).filter((n) => /^--(text-|spacing)|radius|height|size|gap|pad|width|lift|title|number|motion|font/.test(n));
check.eq("ธีมฟ้าเปลี่ยนแค่สี: ไม่มีค่าขนาด ระยะ หรือการจัดวาง", notColour, []);
const d82 = css.slice(css.indexOf("--accent-ink:"));
const literal = [...d82.matchAll(/^\s+(background|color|border-color|box-shadow)\s*:\s*([^;]+);/gm)]
  .map((m) => m[2])
  .filter((v) => !/^var\(/.test(v) && !/^(transparent|none)$/.test(v) && !/^0 0 0 [\d.]+rem var\(/.test(v));
check.eq("สีในส่วน D82 มาจากตัวแปรกลางทั้งหมด (ธีมฟ้าแค่เปลี่ยนค่าตัวแปร)", literal, []);

// --- 2. the theme rule ------------------------------------------------------------------
const theme = await loadTs("lib/theme");
check.eq("ไม่ได้เลือก + เปิดในเบราว์เซอร์ = ขาว", theme.resolveTheme(null, false), "white");
check.eq("ไม่ได้เลือก + เปิดจากไอคอนหน้าจอโฮม = ฟ้า", theme.resolveTheme(null, true), "blue");
check.eq("🔴 เลือกขาวเอง ชนะอัตโนมัติ แม้เปิดจากไอคอน", theme.resolveTheme("white", true), "white");
check.eq("🔴 เลือกฟ้าเอง ชนะอัตโนมัติ แม้เปิดในเบราว์เซอร์", theme.resolveTheme("blue", false), "blue");
check.eq("ค่าแปลก ๆ ที่อ่านได้ = อัตโนมัติ", [theme.resolveTheme("purple", false), theme.resolveTheme("", true)], ["white", "blue"]);

function boot({ stored, storageThrows = false, standalone = false, mediaThrows = false }) {
  const dataset = {};
  const sandbox = {
    document: { documentElement: { dataset } },
    window: {
      localStorage: {
        getItem: (key) => {
          if (storageThrows) throw new Error("SecurityError");
          return key === theme.THEME_KEY ? stored : null;
        },
      },
      matchMedia: () => {
        if (mediaThrows) throw new Error("no matchMedia");
        return { matches: standalone };
      },
      navigator: {},
    },
  };
  vm.runInNewContext(theme.THEME_BOOT, sandbox);
  return dataset.theme;
}
check.eq("สคริปต์ใน <head>: ค่าที่เลือกไว้ถูกใช้ก่อนวาดจอ", boot({ stored: "blue" }), "blue");
check.eq("🔴 สคริปต์ใน <head>: อ่านค่าไม่ได้ (storage ถูกปิด) = อัตโนมัติ ไม่ใช่หน้าว่าง", boot({ storageThrows: true }), "white");
check.eq("สคริปต์ใน <head>: อ่านค่าไม่ได้ + เปิดจากไอคอน = ฟ้า", boot({ storageThrows: true, standalone: true }), "blue");
check.eq("สคริปต์ใน <head>: ตรวจโหมดเปิดไม่ได้ก็ยังได้ธีม", boot({ stored: null, mediaThrows: true }), "white");
const layout = source("app/layout.tsx");
check.ok(
  "ธีมถูกตั้งใน <head> ก่อนวาดจอ (ไม่กะพริบ)",
  /<head>\s*\{[^}]*\}\s*<script dangerouslySetInnerHTML=\{\{ __html: THEME_BOOT \}\} \/>\s*<\/head>/.test(layout) && /suppressHydrationWarning/.test(layout),
);
const display = source("app/(app)/settings/display/page.tsx");
check.ok("หน้าการแสดงผลมี อัตโนมัติ · ฟ้า · ขาว และเลือกแล้วจำในเครื่อง", theme.THEME_CHOICES.map((c) => c.label).join("·") === "อัตโนมัติ·ฟ้า·ขาว" && /chooseTheme\(entry\.value\)/.test(display));
check.ok("ตัวเลือกที่ใช้อยู่บอกด้วยเครื่องหมายและคำ ไม่ใช่สีอย่างเดียว", /<Check aria-hidden="true"[^>]*\/>\s*ใช้อยู่/.test(display));

// --- 4. the raised ขายยา disc ------------------------------------------------------------
const tabs = await loadTs("lib/nav/tabs");
check.eq("ปุ่มกลางมีปุ่มเดียว คือขายยา", tabs.TABS.filter((t) => t.center).map((t) => t.href), ["/sell"]);
check.eq("ลำดับแถบ: หน้าแรก · คลังยา · ขายยา · รับสินค้า", tabs.visibleTabs("owner").map((t) => t.label), ["หน้าแรก", "คลังยา", "ขายยา", "รับสินค้า"]);
const mobile = source("components/nav/MobileNav.tsx");
check.ok(
  "🔴 ปุ่มกลางมีคำ \"ขายยา\" ใต้ปุ่ม ไม่ใช่ไอคอนอย่างเดียว",
  /\{tab\.center \? \(\s*<span className="tab-center-disc">[\s\S]*?\) : \([\s\S]*?\)\}\s*<span className="tab-label">\{tab\.label\}<\/span>/.test(mobile),
);
// No role lacks ขายยา today, so the proof uses a menu where selling needs
// a permission only the owner has: the disc must follow it.
const { MENU } = await loadTs("lib/nav/menu");
const sellOnlyOwner = MENU.map((group) => ({
  ...group,
  items: group.items.map((item) => (item.href === "/sell" ? { ...item, ability: "manageStoreProfile" } : item)),
}));
check.eq("🔴 ปุ่มกลางขึ้นตามสิทธิ์ขาย: ไม่มีสิทธิ์ = ไม่มีปุ่ม", tabs.visibleTabs("staff", sellOnlyOwner).map((t) => t.href), ["/", "/stock"]);
check.eq("มีสิทธิ์ขาย = ปุ่มกลางยังอยู่", tabs.visibleTabs("owner", sellOnlyOwner).map((t) => t.href), ["/", "/stock", "/sell", "/receiving"]);
check.ok("ไม่มีปุ่มกลางแถบยังสมดุล: ทุกปุ่มกว้างเท่ากัน", /\.tab-item \{[^}]*flex: 1;/.test(css) && /<li key=\{tab\.href\} className="flex flex-1">/.test(mobile));
check.ok("ปุ่มกลางกดได้ทั้งช่อง สูงเท่าแถบ (≥ 44px)", /\.tab-center-disc \{[^}]*width: var\(--tab-center\)/.test(css) && parseFloat(white["--tab-center"]) * 16 >= 44);

// --- 4b. the home summary never shows more than the role may see -----------------------
const summary = await loadTs("lib/home-summary");
check.eq("พนักงานขาย: ไม่เห็นการ์ดสรุปเลย", summary.summaryCardsFor("staff"), { expiring: false, scans: false });
check.eq("ยังไม่รู้สิทธิ์: ไม่เห็นการ์ด", summary.summaryCardsFor(undefined), { expiring: false, scans: false });
check.eq("เภสัชกร: เห็นล็อตใกล้หมดอายุ และใบที่ถ่ายไว้", summary.summaryCardsFor("pharmacist"), { expiring: true, scans: true });
const home = source("app/(app)/page.tsx");
check.ok(
  "🔴 การ์ดสรุปไม่มีมูลค่าคลังหรือราคา (ของ owner เท่านั้น D20)",
  !/inventory-value|InventoryValue|stock_value|available_value|total_value|MoneyText/.test(home),
);
check.ok("การ์ดแต่ละใบแสดงเฉพาะเมื่อมีสิทธิ์", /\{cards\.expiring \? \(/.test(home) && /\{cards\.scans \? \(/.test(home));
check.eq("ล็อตภายใน 90 วัน = วิกฤต + เสี่ยงสูง", summary.lotsWithin90Days({ critical: { lot_count: 2 }, high_risk: { lot_count: 3 }, warning: { lot_count: 9 } }), 5);
check.eq(
  "ใบที่ยังไม่ได้รับเข้า: ไม่นับใบที่รับแล้ว ใบที่ทิ้ง หรือใบว่าง",
  summary.openScanCount([
    { status: "uploaded", page_count: 2 },
    { status: "needs_review", page_count: 1 },
    { status: "uploaded", page_count: 0 },
    { status: "converted", page_count: 3 },
    { status: "rejected", page_count: 1 },
  ]),
  2,
);
check.eq("คำทักทาย: ชื่อแรก หรือ สวัสดี เปล่า ๆ", [summary.greeting("อร ทดสอบ"), summary.greeting(null)], ["สวัสดี คุณอร", "สวัสดี"]);

// --- the rest of D82 on a phone ------------------------------------------------------------
const header = source("components/common/PageHeader.tsx");
check.ok("หัวข้อใหญ่ส่งตัวเองให้แถบบนเฝ้าดู", /ref=\{repeatsTopBar \? setLargeTitle : undefined\}/.test(header));
check.ok(
  "แถบบนซ่อนชื่อหน้าเฉพาะตอนหัวข้อใหญ่อยู่ใต้แถบครบทั้งตัว (ไม่ขยับ ไม่เฟด)",
  /\.top-bar\[data-title-below\] \.top-bar-title \{\s*opacity: 0;/.test(css) && !/\.top-bar-title \{[^}]*transition/.test(css) && /intersectionRatio >= 0\.99/.test(mobile),
);
check.ok("← อยู่ในกล่องมุมมน และยังมีชื่อหน้าแม่ (D34)", /<span aria-hidden="true" className="back-box">\s*<ChevronLeft[^>]*\/>\s*<\/span>\s*<span className="truncate">\{parent\.title\}<\/span>/.test(mobile));
check.ok("ปุ่มหลัก: คำ แล้วลูกศร →", /\{primaryAction\.label\}\s*<\/span>\s*<ArrowRight aria-hidden="true"/.test(header));
check.ok("ตัวกรองเป็นแท็บเม็ดยาบนราง", /\.chip-row \{[^}]*background: var\(--seg-bg\)/.test(css));
check.ok("ไม่มีภาพประกอบ / รูปตกแต่ง ในหน้าแรก", !/<img|<Image|\.png|\.jpg|\.svg"/.test(home));

// --- D83: soft UI (the owner's picture of 19 Nov), phone only ----------------------
// Everything after the D83 heading is one :root of tokens, then one
// (width < 40rem) block — so not one soft rule can reach a computer.
const softTop = soft.replace(/^[\s\S]*?(?=:root)/, "");
const softOutside = softTop.replace(/^:root\s*\{[^}]*\}\s*/, "");
check.ok("soft UI ทั้งหมดอยู่ในบล็อกมือถือ (จอคอมไม่เปลี่ยน)", /^@media \(width < 40rem\) \{[\s\S]*\}\s*$/.test(softOutside.trim()) && (softOutside.match(/@media/g) ?? []).length === 1);
const softRule = (selectorStart) => soft.match(new RegExp(`\\n {2}${selectorStart.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}[^{]*\\{([^}]*)\\}`))?.[1] ?? "";
check.ok(
  "การ์ดและรายการนูนด้วยเงานุ่ม ไม่มีเส้นขอบ",
  /box-shadow: var\(--soft-raise\);/.test(softRule(".list-group,")) && /border-color: transparent;/.test(softRule(".list-group,")),
);
check.ok("ปุ่มหลักเป็นปุ่มนูนสีอ่อน คำสีเข้ม และกดแล้วยุบ", /background: var\(--surface\);[\s\S]*color: var\(--ink\);[\s\S]*box-shadow: var\(--soft-raise\);/.test(softRule(".primary-action")) && /box-shadow: var\(--soft-inset\);/.test(softRule(".primary-action:active")));
check.ok("ช่องกรอกยุบลงในพื้น", /box-shadow: var\(--soft-inset\);/.test(softRule('[data-slot="input"]:not(:disabled),')));
check.ok(
  "🔴 ตัวกรองที่เลือก: นูนขึ้น และตัวหนา — ไม่ใช่สีอย่างเดียว (D34)",
  /box-shadow: var\(--soft-raise-sm\);[\s\S]*font-weight: 700;/.test(softRule('.chip-row > [data-slot="button"][aria-pressed="true"],')),
);
check.ok("ไอคอนเป็นเส้นในกรอบเส้นบาง ยังหนากว่าภาพ (2px)", /border: 1px solid var\(--soft-line\);/.test(softRule(".list-row-icon")) && /stroke-width: 2;/.test(softRule(".list-row-icon svg")));
check.ok("ปุ่มธรรมดา (รีเฟรช · ทิ้งร่าง) เป็นปุ่มนูนเล็ก", /box-shadow: var\(--soft-raise-sm\);/.test(softRule('[data-slot="button"][data-variant="outline"]')) && /data-variant=\{variant \?\? "default"\}/.test(source("components/ui/button.tsx")));
check.ok("ช่องว่างเปล่าเป็นหลุมยุบ ไม่ใช่กล่องเส้นประ", /box-shadow: var\(--soft-inset\);/.test(softRule(".empty-box")) && /className="empty-box /.test(source("components/common/EmptyState.tsx")));
check.ok("ไม่มีการ์ดสีเข้มบนมือถือ: การ์ดสรุปเป็นการ์ดนูนสีอ่อน", whitePhone["--hero-bg"] === "var(--surface)" && bluePhone["--hero-bg"] === "var(--surface)");

process.exit(check.done() ? 1 : 0);
