/** D32 (ฉบับแก้): ประวัติรับสินค้าและต้นทุน จำกัดที่ระดับหน้า ด้วย viewReports
 *
 *  The original D32 asked for the cost column to be hidden from staff. That
 *  code never ran: the page is gated on viewReports, which is the same pair of
 *  roles as viewCost, so anyone who reached the render could already see cost.
 *  Chat A chose to delete it, because a guard that cannot fire is worse than
 *  no guard — whoever reads it believes a protection is in place.
 *
 *  Deleting it leaves the page gate as the only thing standing between staff
 *  and supplier costs, so the gate is what this file guards. It reads the real
 *  ability matrix rather than restating it, so widening viewReports one day
 *  fails here instead of quietly handing staff the costs.
 */

import { createChecker, source } from "./lib.mjs";

const check = createChecker("D32 — staff เข้าประวัติรับสินค้าไม่ได้");

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

const canView = (role) => (rolesFor("viewReports") ?? []).includes(role);

check.eq("อ่านตารางสิทธิ์ได้จริง ไม่ใช่เดา", GROUPS.MANAGERS, ["owner", "pharmacist"]);
check.eq("staff เปิดประวัติรับสินค้าไม่ได้", canView("staff"), false);
check.eq("pharmacist เปิดได้ (เป็นคนรับของ เห็นต้นทุนอยู่แล้ว)", canView("pharmacist"), true);
check.eq("owner เปิดได้", canView("owner"), true);
check.eq(
  "viewCost ยังเป็น owner + pharmacist เหมือนเดิม (D11/D20 ไม่ถูกกระทบ)",
  rolesFor("viewCost"),
  ["owner", "pharmacist"],
);

// --- 2. both receiving-history pages actually use that gate ---------------
for (const [where, file] of [
  ["รายการ", "app/(app)/history/purchases/page.tsx"],
  ["รายละเอียด", "app/(app)/history/purchases/[id]/page.tsx"],
]) {
  const page = source(file);
  check.ok(
    `${where}: กั้นด้วย viewReports`,
    /const allowed = can\(me\?\.role, ABILITIES\.viewReports\);/.test(page),
    "this gate is now the only thing keeping staff away from supplier costs",
  );
  check.ok(
    `${where}: ไม่มีสิทธิ์แล้วขึ้นหน้าไม่มีสิทธิ์`,
    /if \(me && !allowed\)/.test(page) && /<AccessDenied \/>/.test(page),
  );
  check.ok(
    `${where}: ไม่มีสิทธิ์แล้วไม่ยิง API ด้วย`,
    /enabled: allowed,/.test(page),
    "rendering nothing is not enough; the request must not go out either",
  );
  check.ok(
    `${where}: ไม่เหลือโค้ดซ่อนคอลัมน์ต้นทุนที่ไม่มีวันทำงาน`,
    !/canSeeCost|canSeeValue/.test(page),
    "dead cost-hiding code is what D32 was corrected to remove",
  );
}

// --- 3. the menu agrees with the page ---------------------------------------
const layout = source("app/(app)/layout.tsx");
check.ok(
  "เมนูประวัติรับสินค้าผูกกับ viewReports เหมือนกัน",
  /\{ href: "\/history\/purchases", label: "[^"]*", ability: ABILITIES\.viewReports \}/.test(layout),
  "a menu gated more loosely than the page would show staff a link into a wall",
);

process.exit(check.done() ? 1 : 0);
