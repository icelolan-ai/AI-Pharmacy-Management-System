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
check.eq("owner เห็น 17 ลิงก์", owner.links, 17);

check.eq("pharmacist เห็น 5 บล็อก", pharmacist.groups, 5);
check.eq("pharmacist เห็น 4 หัวข้อ", pharmacist.headings.length, 4);
check.eq("pharmacist เห็น 14 ลิงก์", pharmacist.links, 14);
check.eq(
  "pharmacist ไม่เห็นของ owner เท่านั้น",
  pharmacist.labels.filter((l) => ["มูลค่าคลังยา", "ตรวจสอบย้อนหลัง", "ข้อมูลร้าน"].includes(l)),
  [],
);

check.eq("staff เห็น 2 บล็อก", staff.groups, 2);
check.eq("staff เห็น 1 หัวข้อ", staff.headings.length, 1);
check.eq("staff เห็นหัวข้อเดียวคือ ตั้งค่า", staff.headings, ["ตั้งค่า"]);
check.eq("staff เห็น 5 ลิงก์", staff.links, 5);
check.eq(
  "staff เห็นลิงก์ตรงกับที่ทดสอบด้วยมือไว้",
  staff.labels,
  // U-8 added ผังร้าน with no ability: a cashier has to be able to look
  // up where a medicine sits.
  ["หน้าแรก", "ขายยา", "คลังยา", "ผังร้าน", "ข้อมูลของฉัน"],
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
const collapsedStore = source("lib/nav/folded-groups.ts");
const foldingSource = source("lib/nav/folding.ts");

// --- D43-a: the folding rules are RUN here, not read ----------------------
//
// Every assertion in this section used to be about the shape of the code: that
// `aria-expanded={open}` appears, that `open` is spelled a certain way, that
// the store file mentions useSyncExternalStore. Not one of them ever opened a
// group, shut it, and looked at the result — which is how D47-1 reached a real
// phone. So the two decisions now live in lib/nav/folding.ts and lib/nav/
// folded-groups.ts as plain functions, and this check executes them.
function lift(text, rewrites, returns) {
  let body = text;
  for (const [from, to] of rewrites) {
    if (!body.includes(from)) throw new Error(`signature moved: ${from}`);
    body = body.replace(from, to);
  }
  body = body.replace(/^export (function|const) /gm, "$1 ").replace(/^export type .*$/gm, "");
  return new Function(`${body}\nreturn { ${returns} };`)();
}

const F = lift(
  foldingSource,
  [
    ["export function opensByDefault(variant: NavVariant): boolean {", "function opensByDefault(variant) {"],
    ["export function isFoldable(heading: string | null): boolean {", "function isFoldable(heading) {"],
    [
      `export function isGroupOpen({
  heading,
  holdsCurrentPage,
  exceptions,
  variant,
}: {
  /** null for the everyday block at the top, which never folds (D43). */
  heading: string | null;
  holdsCurrentPage: boolean;
  exceptions: ReadonlySet<string>;
  variant: NavVariant;
}): boolean {`,
      "function isGroupOpen({ heading, holdsCurrentPage, exceptions, variant }) {",
    ],
  ],
  "isGroupOpen, opensByDefault, isFoldable",
);

// Only the two pure functions are lifted; the hook around them needs React.
// Each is matched as a whole declaration and asserted to have been found, so
// a rename fails loudly instead of leaving this check running a stub (D43-c).
function declaration(label, pattern) {
  const found = collapsedStore.match(pattern)?.[0] ?? "";
  check.ok(`อ่าน${label}ออกมาได้จริง`, found !== "", "nothing to assert against");
  return found;
}
const S = lift(
  declaration("ตัวอ่านค่าที่เก็บไว้", /export function parseExceptions[\s\S]*?\n\}/) +
    "\n" +
    declaration("ตัวสลับสถานะ", /export function toggledExceptions[\s\S]*?\n\}/),
  [
    ["export function parseExceptions(raw: string | null): ReadonlySet<string> {", "function parseExceptions(raw) {"],
    [
      `export function toggledExceptions(
  exceptions: ReadonlySet<string>,
  heading: string,
): string[] {`,
      "function toggledExceptions(exceptions, heading) {",
    ],
    ["const parsed = JSON.parse(raw) as unknown;", "const parsed = JSON.parse(raw);"],
    ['parsed.filter((entry): entry is string => typeof entry === "string")', 'parsed.filter((entry) => typeof entry === "string")'],
  ],
  "parseExceptions, toggledExceptions",
);

const EVERYDAY = null;
const GROUP = "หน้าที่ประจำวัน";
const none = new Set();

// A known answer first: if the lift produced something that runs but is not
// the real code, everything below would be meaningless.
check.eq(
  "ยกโค้ดตัดสินการพับจริงออกมารันได้ ไม่ใช่สำเนาในไฟล์นี้",
  [F.opensByDefault("sidebar"), F.opensByDefault("panel"), F.isFoldable(EVERYDAY)],
  [true, false, false],
);

const openIn = (variant, exceptions, holdsCurrentPage = false) =>
  F.isGroupOpen({ heading: GROUP, holdsCurrentPage, exceptions, variant });

check.eq(
  "🔴 บล็อกบนสุดเปิดเสมอ ทั้งสองอุปกรณ์ (D43)",
  [
    F.isGroupOpen({ heading: EVERYDAY, holdsCurrentPage: false, exceptions: none, variant: "sidebar" }),
    F.isGroupOpen({ heading: EVERYDAY, holdsCurrentPage: false, exceptions: none, variant: "panel" }),
  ],
  [true, true],
);
check.eq("PC: ยังไม่เคยแตะ = เปิดทุกกลุ่ม (D43 เดิม)", openIn("sidebar", none), true);
check.eq("มือถือ: ยังไม่เคยแตะ = พับทุกกลุ่ม (D47-2)", openIn("panel", none), false);

/** One press of the heading, through the real store logic. */
function press(variant, exceptions) {
  return new Set(S.toggledExceptions(exceptions, GROUP));
}

for (const variant of ["sidebar", "panel"]) {
  const start = openIn(variant, none);
  const once = press(variant, none);
  const twice = press(variant, once);
  check.eq(
    `${variant}: กดหัวข้อครั้งเดียว สลับสถานะ`,
    openIn(variant, once),
    !start,
  );
  check.eq(
    `${variant}: กดสองครั้ง กลับมาเหมือนเดิม`,
    openIn(variant, twice),
    start,
  );
}

// D47-1. This is the assertion the bug got past: the old rule forced the group
// holding the current page open and turned its heading off, so pressing it did
// nothing at all. A heading that does nothing reads as broken (D34).
const heldOnce = press("panel", none);
check.eq(
  "🔴 D47-1: กลุ่มที่มีหน้าที่กำลังดูอยู่ ก็ต้องกดพับได้",
  [openIn("sidebar", none, true), openIn("sidebar", press("sidebar", none), true)],
  [true, false],
);
check.eq(
  "🔴 D47-1: บนมือถือก็เช่นกัน กดแล้วต้องเปลี่ยนสถานะ",
  [openIn("panel", none, true), openIn("panel", heldOnce, true)],
  [true, false],
);
check.ok(
  "ไม่มีปุ่มหัวข้อไหนถูกปิดการใช้งาน",
  !/disabled=/.test(nav),
  "D47-1: a heading that cannot be pressed is the bug, not the rule",
);
check.eq(
  "มาถึงหน้าที่อยู่ในกลุ่มที่ยังไม่เคยแตะ -> กลุ่มเปิดให้เอง",
  openIn("panel", none, true),
  true,
);

check.ok(
  "PC กับมือถือ จำแยกกัน ไม่ปนกัน",
  /\$\{PREFIX\}\$\{variant\}\./.test(collapsedStore),
  "folding a group on a short screen must not fold it on the shop computer",
);
check.eq(
  "ข้อมูลเสียหรือไม่มี -> กลับไปใช้ค่าเริ่มต้นของอุปกรณ์",
  [
    S.parseExceptions(null).size,
    S.parseExceptions("not json").size,
    S.parseExceptions('{"a":1}').size,
    S.parseExceptions('["ตั้งค่า", 7, null]').size,
  ],
  [0, 0, 0, 1],
);
// The heading button element itself, matched as a whole rather than sliced
// between two markers. Both earlier attempts went wrong this way: one ended
// at a marker that sits inside the button, and one ended at a marker that
// stopped existing — indexOf returned -1, the slice ran to the end of the
// file, and a mutation passed against the wrong element entirely (D43-b).
const headingBlock = nav.match(/<button[\s\S]*?<\/button>/)?.[0] ?? "";
check.ok("อ่านปุ่มหัวข้อกลุ่มออกมาได้จริง", headingBlock !== "", "nothing to assert against");

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
  // The rule itself is proved by running isFoldable/isGroupOpen above. What
  // is checked here is that the menu asks them instead of deciding again.
  "🔴 เมนูถามฟังก์ชันที่เทสต์รันจริง ไม่ได้ตัดสินเองซ้ำ",
  /const foldable = isFoldable\(group\.heading\);/.test(nav)
    && /const open = isGroupOpen\(\{/.test(nav),
  "a second copy of the rule inside the component is one the tests never see",
);
check.ok(
  "กลุ่มที่กำลังดูอยู่ ยังบอกได้ว่าดูหน้านี้อยู่ แต่พับได้ (D47-1)",
  /holdsCurrentPage[\s\S]{0,40}ดูหน้านี้อยู่/.test(headingBlock),
);
check.ok(
  "กลุ่มที่พับแล้ว บอกว่าพับอยู่ ไม่ใช่ยังบอกว่าเปิดอยู่",
  headingBlock.indexOf("{open") < headingBlock.indexOf("ดูหน้านี้อยู่"),
  "the old order claimed เปิดอยู่ for a folded group holding the current page",
);
// --- D44: หน้าตาเมนู หลังผู้ใช้ดูแล้วยังแยกไม่ออก -------------------------
// Sizes are read from the exported constants and compared as numbers, and the
// class lists are read off the elements that actually carry them, so none of
// this depends on how the file is laid out (D43-b).
const TEXT_PX = { "text-xs": 12, "text-sm": 14, "text-base": 16, "text-lg": 18 };
function exportedSize(name) {
  const found = nav.match(new RegExp(`export const ${name} = "([^"]+)"`));
  return found ? (TEXT_PX[found[1]] ?? 0) : 0;
}

check.ok(
  "หัวข้อกลุ่มไม่เล็กกว่าเมนูย่อย (จอกว้าง)",
  exportedSize("HEADING_TEXT") >= exportedSize("ITEM_TEXT") && exportedSize("HEADING_TEXT") > 0,
  `D34/D44: heading ${exportedSize("HEADING_TEXT")}px vs item ${exportedSize("ITEM_TEXT")}px`,
);
check.ok(
  "หัวข้อกลุ่มไม่เล็กกว่าเมนูย่อย (มือถือ)",
  exportedSize("PANEL_HEADING_TEXT") >= exportedSize("PANEL_ITEM_TEXT")
    && exportedSize("PANEL_HEADING_TEXT") > 0,
);
check.ok(
  "🔴 ชื่อกลุ่มต้องไม่ถูกตัด",
  (() => {
    const wrapper = nav.match(/<span className="([^"]*)">\{group\.heading\}<\/span>/);
    return wrapper !== null && !/truncate|line-clamp|text-ellipsis/.test(wrapper[1]);
  })(),
  "D44: the name was cut to \"ห...\" to make room for the status word",
);
check.ok(
  "คำบอกสถานะอยู่คนละบรรทัดกับชื่อกลุ่ม",
  /flex-col/.test(headingBlock),
  "D44: side by side is what squeezed the name in the first place",
);
check.ok(
  "เมนูย่อยเยื้องเข้าไป ส่วนบล็อกบนสุดไม่เยื้อง",
  (() => {
    const ternary = nav.match(/foldable \? "(ml-[^"]*)" : "([^"]*)"/);
    return ternary !== null && /\bml-\d/.test(ternary[1]) && !/\bml-\d/.test(ternary[2]);
  })(),
  "D44: submenu items must not sit in the same column as the everyday block",
);
check.ok(
  "มีเส้นตั้งด้านซ้ายของกลุ่ม และเส้นสั้นแตกเข้าหาแต่ละรายการ",
  /border-l border-slate-200/.test(nav) && /absolute left-0 top-1\/2 h-px w-3/.test(nav),
  "D44: the tree is what shows a link belongs to its heading",
);
check.ok(
  "เมนูย่อยมีจุดสีเขียวนำหน้า และเป็นของประกอบเท่านั้น",
  /aria-hidden="true"[\s\S]{0,120}rounded-full bg-green-600/.test(nav),
  "D34: the dot may decorate the label, never replace it",
);
// The class list of whatever element renders each menu name. Matches with or
// without a className, so removing one does not silently pass — the element
// still has to be found.
function nameClasses(expression) {
  const found = nav.match(new RegExp(`<span(?: className="([^"]*)")?>\{${expression}\}</span>`));
  return found === null ? null : (found[1] ?? "");
}
const HEADING_CLASSES = nameClasses("group\.heading");
const LABEL_CLASSES = nameClasses("item\.label");

check.ok(
  "ชื่อเมนูย่อยต้องมองเห็นได้ ไม่ถูกซ่อนไว้ให้เหลือแต่จุดสี",
  LABEL_CLASSES !== null && !/sr-only|hidden|invisible|opacity-0/.test(LABEL_CLASSES),
  "D34: hiding the label leaves the green dot carrying the meaning on its own",
);
check.ok(
  // D44 ข้อ 5 covered the group name and missed the link name, so the same
  // bug reappeared one row down: "ยาใกล้ห..." with the "กำลังดูอยู่" badge
  // beside it. The rule now reads: no menu name is ever cut.
  "🔴 ชื่อเมนูทุกอันห้ามถูกตัด ทั้งชื่อกลุ่มและชื่อลิงก์",
  HEADING_CLASSES !== null
    && LABEL_CLASSES !== null
    && !/truncate|line-clamp|text-ellipsis/.test(HEADING_CLASSES)
    && !/truncate|line-clamp|text-ellipsis/.test(LABEL_CLASSES),
  "D44: move the badge to its own line — never shorten the name",
);
check.ok(
  "ป้าย “กำลังดูอยู่” อยู่คนละบรรทัดกับชื่อลิงก์",
  /flex flex-col justify-center[^"]*"\s*,\s*$/m.test(nav) || /"flex flex-col justify-center/.test(nav),
  "D44: side by side is what cut the name",
);
check.ok(
  "เมนูหลักตัวหนาเข้ม เมนูย่อยบางและอ่อนกว่า",
  /foldable \? "font-normal" : "font-semibold"/.test(nav)
    && /text-slate-600 hover:bg-slate-100[\s\S]{0,80}text-slate-900/.test(nav),
);
check.ok(
  "ทุกแถวสูงอย่างน้อย 48px รวมหัวข้อกลุ่ม",
  (() => {
    const constant = nav.match(/const ROW_MIN_HEIGHT = "min-h-(\d+)"/);
    return constant !== null && Number(constant[1]) * 4 >= 48;
  })(),
  "D34: Tailwind min-h-12 is 48px",
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
  /\$\{userId \?\? "anonymous"\}/.test(collapsedStore),
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
