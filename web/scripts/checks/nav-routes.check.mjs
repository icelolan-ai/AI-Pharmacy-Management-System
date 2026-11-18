/** D78 — ← ไปหน้าแม่ตามโครงสร้าง · แถบล่างตรงกับสิทธิ์ · ไม่โผล่บนจอคอม
 *
 *  The real lib/nav/routes.ts and lib/nav/tabs.ts are loaded and run
 *  (D43-a), against every page that exists under src/app/(app) — found on
 *  disk, so a new page nobody declared fails here.
 */

import { readdirSync } from "node:fs";
import { join, relative } from "node:path";

import { createChecker, SRC, source } from "./lib.mjs";
import { loadTs } from "./load-ts.mjs";

const check = createChecker("D78 — ← ไปหน้าแม่ · แถบล่างตามสิทธิ์");

const routes = await loadTs("lib/nav/routes");
const tabs = await loadTs("lib/nav/tabs");
const items = await loadTs("lib/nav/items");
const { MENU } = await loadTs("lib/nav/menu");

// --- 1. every page has a parent that exists, and the chain reaches home ----
function pagesOnDisk(dir = join(SRC, "app", "(app)"), found = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) pagesOnDisk(full, found);
    else if (entry.name === "page.tsx") {
      const route =
        "/" +
        relative(join(SRC, "app", "(app)"), full)
          .replace(/\\/g, "/")
          .replace(/\/?page\.tsx$/, "")
          .split("/")
          .filter((part) => part !== "" && !part.startsWith("("))
          .map((part) => (/^\[.+\]$/.test(part) ? "[id]" : part))
          .join("/");
      found.push(route === "/" ? "/" : route.replace(/\/$/, ""));
    }
  }
  return found;
}

const pages = pagesOnDisk().sort();
const declared = routes.ROUTES.map((route) => route.pattern).sort();
check.ok("เจอหน้าในแอปครบ", pages.length >= 20, `${pages.length} pages`);
check.eq("🔴 ทุกหน้าที่มีอยู่จริงประกาศหน้าแม่ไว้แล้ว", pages.filter((page) => !declared.includes(page)), []);
check.eq("ไม่มีหน้าที่ประกาศไว้แต่ไม่มีอยู่จริง", declared.filter((page) => !pages.includes(page)), []);
check.eq(
  "มีแค่หน้าแรกที่ไม่มีหน้าแม่",
  routes.ROUTES.filter((route) => route.parent === null).map((route) => route.pattern),
  ["/"],
);
check.eq(
  "หน้าแม่ทุกหน้าเป็นหน้าที่มีอยู่จริง",
  routes.ROUTES.filter((route) => route.parent !== null && !pages.includes(route.parent)).map((r) => r.pattern),
  [],
);
check.eq(
  "🔴 ไล่หน้าแม่ไปเรื่อย ๆ ถึงหน้าแรกเสมอ ไม่วนกลับ",
  pages.filter((page) => routes.ancestry(page).at(-1) !== "/"),
  [],
);
check.eq(
  "ที่อยู่จริงของหน้าย่อย หาหน้าแม่ได้ถูก",
  [
    routes.parentHref("/history/sales/8d3f0e2a-1111-4111-8111-111111111111"),
    routes.parentHref("/stock/abc"),
    routes.parentHref("/history/sales"),
    routes.parentHref("/"),
    routes.parentHref("/no-such-page"),
  ],
  ["/history/sales", "/stock", "/", null, null],
);
check.eq(
  "ชื่อหน้าของหน้าในเมนู มาจากเมนูเอง ไม่เขียนซ้ำ",
  MENU.flatMap((group) => group.items)
    .filter((item) => routes.routeFor(item.href)?.title !== item.label)
    .map((item) => `${item.href}: ${routes.routeFor(item.href)?.title} ≠ ${item.label}`),
  [],
);

// --- 2. the bar and the home buttons follow each role's permissions --------
// Run the real filter for each role and compare with what the menu itself
// shows that role. One list, one rule: a tab may appear only if its menu
// entry does.
const ROLES = ["owner", "pharmacist", "staff"];
const menuHrefs = (role) => items.visibleGroups(MENU, role).flatMap((group) => group.items.map((item) => item.href));
for (const role of ROLES) {
  check.eq(
    `${role}: ปุ่มในแถบล่างคือรายการเมนูที่ ${role} เห็น ไม่มากไม่น้อย`,
    tabs.visibleTabs(role).map((tab) => tab.href),
    tabs.TABS.map((tab) => tab.href).filter((href) => menuHrefs(role).includes(href)),
  );
  check.eq(
    `${role}: ปุ่มงานหน้าแรกคือรายการเมนูที่ ${role} เห็น`,
    tabs.visibleHomeTasks(role).map((task) => task.href),
    tabs.HOME_TASKS.filter((href) => menuHrefs(role).includes(href)),
  );
}
check.eq("พนักงานขายไม่มีปุ่มรับของ (แถบเหลือ 3 ปุ่ม + เมนู)", tabs.visibleTabs("staff").map((t) => t.href), ["/", "/stock", "/sell"]);
// D82: หน้าแรก · คลังยา · [ขายยา] · รับสินค้า · เมนู
check.eq("เภสัชกรมีครบ 4 ปุ่ม + เมนู ขายยาอยู่กลาง", tabs.visibleTabs("pharmacist").map((t) => t.href), ["/", "/stock", "/sell", "/receiving"]);
check.eq("ยังไม่รู้สิทธิ์ = เห็นเฉพาะปุ่มที่ไม่ต้องใช้สิทธิ์", tabs.visibleTabs(undefined).map((t) => t.href), ["/", "/stock", "/sell"]);
check.eq(
  "ทุกปุ่มในแถบล่างและหน้าแรกชี้ไปรายการที่มีในเมนูจริง",
  [...tabs.TABS.map((t) => t.href), ...tabs.HOME_TASKS].filter((href) => tabs.menuItem(href) === undefined),
  [],
);
check.eq(
  "ปุ่มที่สว่างคือหน้าที่อยู่หรือหน้าแม่ที่เป็นปุ่ม",
  ["/", "/sell", "/stock/abc", "/receiving/xyz", "/scan", "/history/sales/1"].map(tabs.currentTab),
  ["/", "/sell", "/stock", "/receiving", null, null],
);

// D78 round 2: one name everywhere — a tab says exactly what its page is called.
for (const role of ROLES) {
  check.eq(
    `${role}: คำบนแถบล่างตรงกับชื่อหน้าปลายทางทุกปุ่ม`,
    tabs.visibleTabs(role).filter((tab) => tab.label !== routes.routeFor(tab.href)?.title).map((t) => `${t.href}: ${t.label}`),
    [],
  );
}
check.eq(
  "คำบนแถบล่าง: ปุ่มที่ผู้ใช้เลือก ขายยาอยู่กลาง (D82)",
  tabs.visibleTabs("owner").map((tab) => tab.label),
  ["หน้าแรก", "คลังยา", "ขายยา", "รับสินค้า"],
);

// The ☰ sheet leaves out what the bar shows — the same filter, run for real.
for (const role of ROLES) {
  const onBar = tabs.hrefsOnTabBar(role);
  const inSheet = items.visibleGroups(items.withoutHrefs(MENU, onBar), role).flatMap((g) => g.items.map((i) => i.href));
  check.eq(`${role}: ตัดออกจากเมนู = ปุ่มที่อยู่บนแถบล่างพอดี`, [...onBar].sort(), tabs.visibleTabs(role).map((t) => t.href).sort());
  check.eq(`${role}: เมนูมือถือไม่มีรายการซ้ำกับแถบล่าง`, inSheet.filter((href) => onBar.has(href)), []);
  check.eq(
    `${role}: เมนูมือถือ + แถบล่าง = เมนูจอคอมครบทุกรายการ`,
    [...inSheet, ...onBar].sort(),
    menuHrefs(role).sort(),
  );
}
check.eq("จอคอม (ไม่ส่งรายการตัดออก) เมนูครบเหมือนเดิม", items.withoutHrefs(MENU, undefined), MENU.map((g) => ({ ...g })));

const nextConfig = source("../next.config.ts");
check.ok("ปิดตัว N ของ Next.js ที่บังปุ่มหน้าแรก", /\bdevIndicators:\s*false\b/.test(nextConfig));

const mobile = source("components/nav/MobileNav.tsx");
const layout = source("app/(app)/layout.tsx");
check.ok("แถบล่างสร้างจาก tabSlots(role, roleKnown) ไม่ใช่รายการแยก", /tabSlots\(role, roleKnown\)\.map\(/.test(mobile));

// --- 2b. while the role loads, a held slot — never a jump, never a guess ----
// (Chat A after D78: a tab that turns up late moves the ones after it under
// a finger about to press. Hold its place, empty; drop it once the answer is no.)
const slotHrefs = (slots) => slots.map((slot) => (slot.kind === "pending" ? `(${slot.href})` : slot.href));
check.eq(
  "ระหว่างรอสิทธิ์: จองที่ของปุ่มรับสินค้าไว้ ว่าง ๆ",
  slotHrefs(tabs.tabSlots(undefined, false)),
  ["/", "/stock", "/sell", "(/receiving)"],
);
check.ok(
  "ที่ที่จองไว้ไม่มีชื่อ ไม่มีไอคอน (ไม่ใช่ปุ่ม)",
  tabs.tabSlots(undefined, false).filter((slot) => slot.kind === "pending").every((slot) => !("label" in slot) && !("icon" in slot)),
);
for (const role of ROLES) {
  check.eq(
    `${role}: โหลดเสร็จแล้วไม่มีที่จองค้าง และตรงกับ visibleTabs`,
    slotHrefs(tabs.tabSlots(role, true)),
    tabs.visibleTabs(role).map((tab) => tab.href),
  );
  // Loaded = the waiting bar with each held slot either filled or dropped —
  // nothing new appears, nothing is reordered.
  const loaded = tabs.tabSlots(role, true).map((slot) => slot.href);
  check.eq(
    `${role}: โหลดเสร็จแล้วปุ่มอยู่ลำดับเดิม ที่จองกลายเป็นปุ่ม หรือหายไปถ้าไม่มีสิทธิ์`,
    loaded,
    tabs.tabSlots(undefined, false).filter((slot) => slot.kind === "tab" || loaded.includes(slot.href)).map((slot) => slot.href),
  );
}
check.eq("โหลดเสร็จแต่ไม่มีบทบาท: ไม่มีที่จองค้าง", slotHrefs(tabs.tabSlots(null, true)), ["/", "/stock", "/sell"]);
check.ok(
  "ที่จองในแถบล่างเป็น <li> ว่าง ซ่อนจากโปรแกรมอ่านจอ ไม่มีลิงก์หรือปุ่มข้างใน",
  /tab\.kind === "pending"\)\s*\{[\s\S]{0,200}?return <li key=\{tab\.href\} aria-hidden="true" data-pending="" className="flex flex-1" \/>;/.test(mobile),
);
check.ok("รู้สิทธิ์แล้ว = โหลดโปรไฟล์เสร็จ ไม่ใช่แค่มีค่า role", /roleKnown=\{me != null\}/.test(layout));
check.ok("หน้าแรกสร้างปุ่มจาก visibleHomeTasks", /visibleHomeTasks\(me\?\.role\)\.map\(/.test(source("app/(app)/page.tsx")));

// --- 3. ← is a link to the parent, never history.back ----------------------
const everySource = (function walk(dir, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (/\.(ts|tsx)$/.test(entry.name)) out.push(full);
  }
  return out;
})(SRC);
const backCalls = /\bhistory\.back\s*\(|\brouter\.back\s*\(|\.go\s*\(\s*-1\s*\)/;
check.eq(
  "🔴 ไม่มีที่ไหนในแอปย้อนตามประวัติเบราว์เซอร์ (history.back / router.back)",
  everySource.filter((file) => backCalls.test(source(relative(SRC, file).replace(/\\/g, "/")))).map((f) => relative(SRC, f)),
  [],
);
const backLink = mobile.match(/<Link\s+href=\{parent\.href\}[\s\S]*?className="back-link"\s*>/)?.[0] ?? "";
check.ok("ปุ่ม ← เป็นลิงก์ไปหน้าแม่ที่ประกาศไว้", backLink !== "", "the ← element was not found whole");
check.ok("ปุ่ม ← บอกชื่อหน้าแม่เป็นคำด้วย ไม่ใช่ลูกศรเปล่า (D34)", /aria-label=\{`กลับไปหน้า\$\{parent\.title\}`\}/.test(backLink) && /<span className="truncate">\{parent\.title\}<\/span>/.test(mobile));
check.ok("หน้าแม่ของปุ่ม ← มาจาก routeFor ที่เดียว", /const route = routeFor\(pathname\);/.test(layout) && /routeFor\(route\.parent\)/.test(layout));

// --- 4. not on a wide screen ----------------------------------------------
const topBar = mobile.match(/<header\s+className="[^"]*top-bar[^"]*"/)?.[0] ?? "";
const bottomRoot = mobile.match(/return \(\s*<div className="([^"]*)">\s*\{open \?/)?.[1] ?? "";
check.ok("แถบบนแบบมือถือซ่อนบนจอคอม", /\bsm:hidden\b/.test(topBar), topBar || "top bar not found");
check.eq("แถบล่างและเมนูมือถือซ่อนบนจอคอม", bottomRoot, "sm:hidden");
check.ok("หัวหน้าแบบจอคอมเดิมซ่อนบนมือถือ และยังอยู่บนจอคอม", /<header className="hidden [^"]*sm:flex"/.test(layout));

process.exit(check.done() ? 1 : 0);
