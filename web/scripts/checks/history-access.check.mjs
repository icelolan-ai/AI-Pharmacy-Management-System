/** D32 + D33 — who may see cost, and where that is decided.
 *
 *  D32: ประวัติรับสินค้าและต้นทุน จำกัดที่ระดับหน้า ด้วย viewReports.
 *  D33: ห้ามซ่อนข้อมูลด้วย ability ที่มี role ชุดเดียวกับ ability ที่กั้นหน้า
 *       เพราะเป็นโค้ดตาย ต้องกั้นที่ระดับหน้าอย่างเดียว.
 *
 *  Pages fall into exactly two groups, and confusing them is the expensive
 *  mistake this file exists to prevent.
 *
 *  GROUP 1 — the page has a gate, and every gate in this app admits a subset
 *  of the roles viewCost admits. Anyone who reaches the render may already see
 *  cost, so a second viewCost check inside is dead. Those were removed.
 *
 *  GROUP 2 — /stock, /stock/[id] and /sell have NO gate. Staff open them every
 *  day. Their cost and price flags are the only thing hiding supplier cost
 *  from a cashier, and deleting one would leak it in silence. This file fails
 *  if they go.
 *
 *  The groups are worked out from the code, not listed by hand, so a new page
 *  lands in the right group by itself.
 */

import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";

import { createChecker, SRC, source } from "./lib.mjs";

const check = createChecker("D32/D33 — ต้นทุนถูกกั้นที่ระดับหน้า");

// --- 1. the ability matrix, read from the file that decides it -------------
const abilities = source("lib/abilities.ts");

function roleList(name) {
  const found = abilities.match(new RegExp(`const ${name}: readonly Role\\[\\] = \\[([^\\]]*)\\]`));
  return found ? found[1].split(",").map((part) => part.trim().replace(/"/g, "")).filter(Boolean) : null;
}

const GROUPS = { MANAGERS: roleList("MANAGERS"), OWNER_ONLY: roleList("OWNER_ONLY") };

function rolesFor(ability) {
  const found = abilities.match(new RegExp(`\\n  ${ability}: ([A-Z_]+),`));
  return found ? GROUPS[found[1]] : null;
}

const COST_ROLES = rolesFor("viewCost");

check.eq("อ่านตารางสิทธิ์ได้จริง ไม่ใช่เดา", GROUPS.MANAGERS, ["owner", "pharmacist"]);
check.eq("viewCost = owner + pharmacist", COST_ROLES, ["owner", "pharmacist"]);
check.eq("staff เปิดประวัติรับสินค้าไม่ได้ (D32)", rolesFor("viewReports").includes("staff"), false);
check.eq("pharmacist เปิดได้ — เป็นคนรับของ เห็นต้นทุนอยู่แล้ว", rolesFor("viewReports").includes("pharmacist"), true);
check.eq("owner เปิดได้", rolesFor("viewReports").includes("owner"), true);

// --- 2. sort every page into its group, from the code ----------------------
const COST_FLAG = /\bcanSee(?:Value|Cost|Price)\b/;
// Counting needs its own /g copy: String.match without /g returns one match,
// so a "used at least twice" test would read 1 no matter how often it appears.
const COST_FLAG_ALL = /\bcanSee(?:Value|Cost|Price)\b/g;

function everyPage(dir = join(SRC, "app"), found = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) everyPage(full, found);
    else if (entry.name === "page.tsx") {
      // Route groups like (app) and (print) are folders, not URL segments.
      const route =
        "/" +
        relative(join(SRC, "app"), full)
          .replace(/\\/g, "/")
          .replace(/\/page\.tsx$/, "")
          .split("/")
          .filter((part) => part !== "" && !part.startsWith("("))
          .join("/");
      found.push({ route, text: readFileSync(full, "utf8") });
    }
  }
  return found;
}

const pages = everyPage();
const gated = [];
const open = [];
for (const page of pages) {
  const gate = page.text.match(/const allowed = can\(me\?\.role, ABILITIES\.(\w+)\);/);
  if (gate) gated.push({ ...page, ability: gate[1] });
  else open.push(page);
}

check.ok("เจอหน้าทั้งหมดในแอป", pages.length >= 20, `found ${pages.length}`);
check.ok("แยกได้ทั้งสองกลุ่ม ไม่ใช่กองเดียว", gated.length > 0 && open.length > 0);

// --- 3. GROUP 1 — gated pages may not carry a second cost check ------------
const notSubsetOfCost = gated.filter(
  (page) => !(rolesFor(page.ability) ?? ["staff"]).every((role) => COST_ROLES.includes(role)),
);
check.eq(
  "ทุกหน้าที่มีด่าน ใช้สิทธิ์ที่เป็นสับเซ็ตของ viewCost (ชั้นสองจึงเป็นโค้ดตายเสมอ)",
  notSubsetOfCost.map((page) => `${page.route} (${page.ability})`),
  [],
);

// Detect the ability, not the variable name: renaming canSeeValue to showMoney
// would hide the dead branch from a name-based test while changing nothing.
check.eq(
  "กลุ่ม 1: ไม่มีหน้าไหนอ้าง ABILITIES.viewCost เลย (D33)",
  gated.filter((page) => /ABILITIES\.viewCost/.test(page.text)).map((page) => page.route),
  [],
);
check.eq(
  "กลุ่ม 1: ไม่มีตัวแปร canSee* ที่ไม่มีวันเป็นเท็จหลงเหลือ",
  gated.filter((page) => COST_FLAG.test(page.text)).map((page) => page.route),
  [],
);

for (const route of ["/history/purchases", "/history/purchases/[id]"]) {
  const page = gated.find((entry) => entry.route === route);
  check.ok(`${route}: กั้นด้วย viewReports (D32)`, page?.ability === "viewReports");
}

check.eq(
  "ทุกหน้าที่มีด่าน แสดงหน้าไม่มีสิทธิ์",
  gated.filter((page) => !/<AccessDenied \/>/.test(page.text)).map((page) => page.route),
  [],
);
// EVERY enabled: on a gated page, not merely one of them. The dashboard alone
// has five sections, so "at least one says allowed" would pass while four of
// them fetched regardless.
const fetchesWithoutPermission = [];
for (const page of gated) {
  for (const [, value] of page.text.matchAll(/enabled: ([^,\n]+),/g)) {
    // `allowed` alone, or `allowed && something` which narrows it further —
    // the dashboard's inventory box is owner-only on top of the gate (D20).
    // Anything that does not start with `allowed` fetches without the right.
    const condition = value.trim();
    if (!/^allowed(\s*&&\s*\S[\s\S]*)?$/.test(condition)) {
      fetchesWithoutPermission.push(`${page.route} (${condition})`);
    }
  }
}
check.eq(
  "ทุก useSection บนหน้าที่มีด่าน ต้องไม่ยิง API ถ้าไม่มีสิทธิ์",
  fetchesWithoutPermission,
  [],
);
// Two gated pages do not use useSection, for different reasons, and the list is
// pinned so a third one has to be looked at rather than slipping in:
//   /settings/store   reads the shared store provider — GET /store is readable
//                     by every role by design; only editing is owner-only.
//   /receiving/[id]   loads the draft in a plain effect with no `allowed`
//                     check, so a staff URL does fire one request that the
//                     backend then rejects. Recorded, not fixed here.
//   /scan             (6.2) loads nothing from the API yet: it only picks and
//                     previews photos in the browser. When uploads arrive it
//                     must either move onto useSection or come off this list.
check.eq(
  "รายชื่อหน้าที่มีด่านแต่ไม่ได้ใช้ useSection ตรงกับที่รู้จัก",
  gated.filter((page) => !/useSection\(/.test(page.text)).map((page) => page.route).sort(),
  ["/receiving/[id]", "/scan", "/settings/store"],
);

// --- 4. GROUP 2 — the flags that really work must stay ---------------------
// These three have no gate, so staff reach them. Removing a flag here does not
// break a build and does not fail any other check — it just shows a cashier
// what the shop paid. That is what these assertions are for.
const GROUP_2 = [
  ["คลังยา", "/stock", /const canSeeValue = can\(me\?\.role, ABILITIES\.viewCost\);/],
  ["รายละเอียดยา", "/stock/[id]", /const canSeeCost = can\(me\?\.role, ABILITIES\.viewCost\);/],
  ["ขายยา", "/sell", /const canSeePrice = can\(me\?\.role, ABILITIES\.viewCost\);/],
];

check.eq("staff เปิดหน้ากลุ่ม 2 ได้จริง — ตัวกรองข้างในจึงทำงานจริง", COST_ROLES.includes("staff"), false);

for (const [label, route, flag] of GROUP_2) {
  const page = pages.find((entry) => entry.route === route);
  check.ok(`${label}: ไม่มีด่านกั้นหน้า — staff เข้าได้`, open.some((entry) => entry.route === route));
  check.ok(
    `${label}: ยังมีตัวกรองต้นทุน ห้ามลบ (ลบแล้ว staff เห็นต้นทุน)`,
    page !== undefined && flag.test(page.text),
    "this flag is NOT the dead pattern D33 bans — there is no page gate above it",
  );
  check.ok(
    `${label}: ตัวกรองถูกส่งต่อไปใช้จริง ไม่ใช่ประกาศทิ้งไว้`,
    page !== undefined && (page.text.match(COST_FLAG_ALL) ?? []).length >= 2,
  );
}

// Counting references on the page is a weak test on its own — the page mostly
// passes the flag down. What actually hides the money is the branch inside the
// component that receives it, so that is asserted where it lives.
const GROUP_2_CONSUMERS = [
  ["ตารางคลังยา", "components/stock/StockTable.tsx", /if \(canSeeValue\)/],
  ["ตารางล็อต", "components/stock/LotTable.tsx", /if \(canSeeCost\)/],
  ["การ์ดสรุปยา", "components/stock/MedicineSummaryCards.tsx", /\{canSeeValue \?/],
  ["การ์ดในตะกร้า", "components/sell/CartItemCard.tsx", /\{canSeePrice \?/],
  ["กล่องยืนยันการขาย", "components/sell/ConfirmSaleDialog.tsx", /\{canSeePrice \?/],
  ["แถบขายสำเร็จ", "components/sell/SaleSuccessBanner.tsx", /\{canSeePrice \?/],
];

for (const [label, file, branch] of GROUP_2_CONSUMERS) {
  check.ok(
    `${label}: ยังซ่อนเงินตามตัวกรองจริง`,
    branch.test(source(file)),
    "without this branch the flag is decoration and staff see the money",
  );
}

// --- 5. the menu agrees with the pages -------------------------------------
const layout = source("app/(app)/layout.tsx");
check.ok(
  "เมนูประวัติรับสินค้าผูกกับ viewReports เหมือนหน้า",
  /\{ href: "\/history\/purchases", label: "[^"]*", ability: ABILITIES\.viewReports \}/.test(layout),
  "a menu gated more loosely than the page would show staff a link into a wall",
);
check.eq(
  "เมนูกลุ่ม 2 ไม่มีการกั้นสิทธิ์ ตรงกับหน้าที่ไม่มีด่าน",
  GROUP_2.filter(([, route]) =>
    new RegExp(`\\{ href: "${route.replace(/[[\]]/g, "\\$&")}", label: "[^"]*", ability:`).test(layout),
  ).map(([, route]) => route),
  [],
);

process.exit(check.done() ? 1 : 0);
