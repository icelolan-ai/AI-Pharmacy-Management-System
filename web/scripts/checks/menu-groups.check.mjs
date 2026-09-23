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

// --- D43: folding, and the one block that may never fold ------------------
// U-3 originally forbade folding outright. The shop owner looked at the
// finished menu and said it was still cluttered, and D41 makes that the
// deciding evidence, so D43 reverses it. These assertions were rewritten
// rather than deleted: the rule changed, so what they guard changed with it.
const collapsedStore = source("lib/nav/collapsed-groups.ts");
// Ends at the items, not at the first "{open": aria-expanded={open} sits
// inside the button, so slicing there cut the block in half and three
// assertions failed against a fragment rather than against the code.
const headingBlock = nav.slice(nav.indexOf("{foldable ? ("), nav.indexOf("? group.items.map("));

check.ok(
  "หัวข้อที่พับได้เป็น <button> จริง มี aria-expanded",
  // role="presentation" leaves <button> in the source while taking it out of
  // the accessibility tree — it looked like a button to this check and like
  // nothing at all to a screen reader, and it slipped the first draft.
  /<button/.test(headingBlock)
    && /aria-expanded=\{open\}/.test(headingBlock)
    && !/role="(presentation|none)"/.test(headingBlock),
  "D43: a div with onClick is not reachable from a keyboard",
);
check.ok(
  "บอกสถานะเป็นข้อความ ไม่ใช่ลูกศรอย่างเดียว",
  /เปิดอยู่/.test(headingBlock) && /พับอยู่/.test(headingBlock),
  "D34: an arrow on its own leaves the state to be guessed",
);
check.ok(
  "🔴 บล็อกบนสุดพับไม่ได้ เพราะ heading เป็น null จึงไม่มีปุ่มให้กด",
  /const foldable = group\.heading !== null;/.test(nav),
  "D43: having to open something before selling is worse than the clutter",
);
check.ok(
  "กลุ่มที่พับไม่ได้ ถือว่าเปิดเสมอ",
  /const open = !foldable \|\|/.test(nav),
);
check.ok(
  "กลุ่มที่มีหน้าที่กำลังดูอยู่ เปิดเสมอแม้เคยพับไว้",
  /holdsCurrentPage \|\| !collapsed\.has/.test(nav),
  "D43: folding away the page you are looking at makes no sense",
);
check.ok(
  "ปุ่มของกลุ่มที่กำลังดูอยู่กดไม่ได้ และบอกเหตุผล",
  /disabled=\{holdsCurrentPage\}/.test(headingBlock) && /กำลังดูหน้าในกลุ่มนี้/.test(headingBlock),
  "a button that does nothing when pressed is worse than one that is clearly off",
);
check.ok(
  "ลิงก์ในกลุ่มที่เปิดแล้ว มีเส้นคั่นเป็นข้อ ๆ",
  /border-b border-slate-100 last:border-b-0/.test(nav),
);
check.ok(
  "PC กับมือถือใช้กติกาพับเดียวกัน ไม่แยกพฤติกรรม",
  // `panel` may size things; it may not decide what is open. Matching it
  // anywhere near the word "collapsed" flagged the declaration line itself,
  // which was a false alarm — this reads the decision instead.
  (() => {
    const decision = nav.match(/const foldable[\s\S]*?const open = [^;]+;/)?.[0] ?? "";
    return decision !== "" && !/panel/.test(decision);
  })(),
  "D43: same rule on both, so nobody has to learn the menu twice",
);
check.ok(
  "กลุ่มว่างถูกตัดทิ้งในโค้ดจริง ไม่ใช่แค่ซ่อนด้วย CSS",
  /\.filter\(\(group\) => group\.items\.length > 0\)/.test(nav),
);

// --- D38: the folded state is a per-person convenience, stored safely -----
check.ok(
  "จำสถานะแยกตามผู้ใช้ ตาม D38",
  /PREFIX \+ \(userId \?\? "anonymous"\)/.test(collapsedStore),
);
check.ok(
  "อ่านและเขียน localStorage อยู่ใน try/catch ทุกจุด",
  (collapsedStore.match(/try \{/g) ?? []).length >= 3,
  "D38: a browser with storage switched off must still show a working menu",
);
check.ok(
  "อ่านไม่ได้ หรือข้อมูลเสีย -> เปิดทุกกลุ่ม ไม่ใช่พับทุกกลุ่ม",
  /if \(!raw\) return new Set\(\)/.test(collapsedStore)
    && /if \(!Array\.isArray\(parsed\)\) return new Set\(\)/.test(collapsedStore),
  "D43: the fallback is everything visible",
);
check.ok(
  "ครั้งแรกที่เข้า เปิดทุกกลุ่ม (ฝั่งเซิร์ฟเวอร์คืน null)",
  /\(\) => null,/.test(collapsedStore),
);
check.ok(
  "อ่านสถานะด้วย useSyncExternalStore ไม่ใช่ setState ใน effect",
  /useSyncExternalStore/.test(collapsedStore) && !/useEffect/.test(collapsedStore),
  "the cleanup that removed state-from-effects is not to be undone here",
);

process.exit(check.done() ? 1 : 0);
