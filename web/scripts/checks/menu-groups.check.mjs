/** U-3: the menu is grouped, and a group with nothing in it disappears.
 *
 *  Fifteen links in one unbroken column meant scanning the whole strip to find
 *  the two pages used all day. They now sit under four headings, with the
 *  everyday pages in an unheaded block at the top so nothing has to be read
 *  past before selling.
 *
 *  The part that can go quietly wrong is a heading left behind after its links
 *  are filtered away by role. An empty "รายงานและประวัติ" would tell a cashier
 *  the shop keeps reports they simply cannot reach — worse than no heading.
 *
 *  Counted here rather than pattern-matched: the menu and the ability matrix
 *  are both read from source and the grouping is applied, so these numbers are
 *  what a person of that role actually ends up looking at.
 */

import { createChecker, source } from "./lib.mjs";

const check = createChecker("U-3 — เมนูจัดกลุ่ม และกลุ่มว่างต้องหายไป");

const layout = source("app/(app)/layout.tsx");
const nav = source("components/nav/AppNav.tsx");
const abilities = source("lib/abilities.ts");

// --- the real ability matrix ----------------------------------------------
function roleList(name) {
  const found = abilities.match(new RegExp(`const ${name}: readonly Role\\[\\] = \\[([^\\]]*)\\]`));
  return found ? found[1].split(",").map((p) => p.trim().replace(/"/g, "")).filter(Boolean) : [];
}
const GROUPS_OF = { MANAGERS: roleList("MANAGERS"), OWNER_ONLY: roleList("OWNER_ONLY") };
function rolesFor(ability) {
  const found = abilities.match(new RegExp(`\\n  ${ability}: ([A-Z_]+),`));
  return found ? GROUPS_OF[found[1]] : [];
}
const can = (role, ability) => !ability || rolesFor(ability).includes(role);

// --- the real menu, parsed out of the layout ------------------------------
function parseMenu() {
  const from = layout.indexOf("const MENU: readonly NavGroup[] = [");
  const body = layout.slice(from, layout.indexOf("\n];", from));
  const chunks = body.split(/\n  \{\s*\n?\s*heading:/).slice(1);
  return chunks.map((chunk) => {
    const heading = chunk.match(/^\s*(null|"([^"]*)")/);
    const items = chunk
      .split(/href:/)
      .slice(1)
      .map((part) => ({
        label: part.match(/label: "([^"]*)"/)?.[1] ?? "?",
        ability: part.match(/ability: ABILITIES\.(\w+)/)?.[1] ?? null,
      }));
    return { heading: heading?.[2] ?? null, items };
  });
}

const MENU = parseMenu();

function seenBy(role) {
  const groups = MENU.map((group) => ({
    heading: group.heading,
    items: group.items.filter((item) => can(role, item.ability)),
  })).filter((group) => group.items.length > 0);
  return {
    groups: groups.length,
    headings: groups.filter((g) => g.heading).map((g) => g.heading),
    links: groups.reduce((total, g) => total + g.items.length, 0),
    labels: groups.flatMap((g) => g.items.map((i) => i.label)),
  };
}

check.eq("อ่านเมนูออกมาได้ครบ 5 บล็อก", MENU.length, 5);
check.eq(
  "ลำดับและชื่อกลุ่มตรงตามที่อนุมัติ",
  MENU.map((g) => g.heading),
  [null, "หน้าที่ประจำวัน", "ยาที่ต้องดูด่วน", "รายงานและประวัติ", "ตั้งค่า"],
);
check.eq(
  "บล็อกบนสุดไม่มีหัวข้อ และเป็นงานที่ใช้ทุกวัน",
  MENU[0].items.map((i) => i.label),
  ["หน้าแรก", "ขายยา", "คลังยา"],
);
check.eq("งานที่ใช้ทุกวันไม่มีตัวไหนถูกจำกัดสิทธิ์", MENU[0].items.every((i) => i.ability === null), true);

// --- what each role ends up seeing ----------------------------------------
const owner = seenBy("owner");
const pharmacist = seenBy("pharmacist");
const staff = seenBy("staff");

check.eq("owner เห็น 5 บล็อก", owner.groups, 5);
check.eq("owner เห็น 4 หัวข้อ", owner.headings.length, 4);
check.eq("owner เห็น 15 ลิงก์", owner.links, 15);

check.eq("pharmacist เห็น 5 บล็อก", pharmacist.groups, 5);
check.eq("pharmacist เห็น 4 หัวข้อ", pharmacist.headings.length, 4);
check.eq("pharmacist เห็น 12 ลิงก์", pharmacist.links, 12);
check.eq(
  "pharmacist ไม่เห็นของ owner เท่านั้น",
  pharmacist.labels.filter((l) => ["มูลค่าคลังยา", "ตรวจสอบย้อนหลัง", "ข้อมูลร้าน"].includes(l)),
  [],
);

check.eq("staff เห็น 2 บล็อก", staff.groups, 2);
check.eq("staff เห็น 1 หัวข้อ", staff.headings.length, 1);
check.eq("staff เห็นหัวข้อเดียวคือ ตั้งค่า", staff.headings, ["ตั้งค่า"]);
check.eq("staff เห็น 4 ลิงก์", staff.links, 4);
check.eq(
  "staff เห็นลิงก์ตรงกับที่ทดสอบด้วยมือไว้",
  staff.labels,
  ["หน้าแรก", "ขายยา", "คลังยา", "ข้อมูลของฉัน"],
);

// --- no heading may survive its links -------------------------------------
const orphaned = [];
for (const role of ["owner", "pharmacist", "staff"]) {
  for (const group of MENU) {
    if (!group.heading) continue;
    const left = group.items.filter((item) => can(role, item.ability)).length;
    const shown = seenBy(role).headings.includes(group.heading);
    if (left === 0 && shown) orphaned.push(`${role}: ${group.heading}`);
  }
}
check.eq("ไม่มีหัวข้อไหนค้างอยู่ทั้งที่ลิงก์ข้างใต้ถูกกรองหมด", orphaned, []);
check.eq(
  "staff ต้องไม่เห็นหัวข้อ “รายงานและประวัติ” ลอยว่าง",
  staff.headings.includes("รายงานและประวัติ"),
  false,
);

// --- headings are text, not controls --------------------------------------
const headingBlock = nav.slice(nav.indexOf("{group.heading ? ("), nav.indexOf("{group.items.map("));
check.ok(
  "หัวข้อกลุ่มเป็นข้อความ ไม่ใช่ปุ่ม",
  /<p\b/.test(headingBlock) && !/<button|onClick|role="button"|tabIndex/.test(headingBlock),
  "a heading that can be pressed invites folding, which U-3 ruled out",
);
check.ok(
  "หัวข้อกลุ่มไม่มีพื้นหลังหรือเอฟเฟกต์ hover ให้ดูเหมือนกดได้",
  !/hover:|cursor-pointer|bg-slate-[0-9]/.test(headingBlock),
);
check.ok(
  "ไม่มีการพับกลุ่ม",
  !/collapsib|Collapsib|<details|aria-expanded/.test(nav),
  "U-3: folding hides pages an older user then has to remember the place of",
);
check.ok(
  "กลุ่มว่างถูกตัดทิ้งในโค้ดจริง ไม่ใช่แค่ซ่อนด้วย CSS",
  /\.filter\(\(group\) => group\.items\.length > 0\)/.test(nav),
);

process.exit(check.done() ? 1 : 0);
