/** D78 — กระจกฝ้าอ่านออกเสมอ · ปุ่มขยายด้วย transform อย่างเดียว · ลดการเคลื่อนไหวแล้วนิ่งสนิท
 *
 *  Reads the real globals.css and works from its values (D43-a): the
 *  contrast is computed from the variables, not asserted as a hope.
 *  How it looks and moves on a real iPhone is for a person to judge (D41).
 */

import { createChecker, source } from "./lib.mjs";

const check = createChecker("D78 — กระจกฝ้า · การขยายปุ่ม · ลดการเคลื่อนไหว");
const css = source("app/globals.css").replace(/\/\*[\s\S]*?\*\//g, "");

/** Every rule as { at: ["@media …", …], selector, decls }, nesting kept. */
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
const phone = (rule) => rule.at.some((a) => /width\s*<\s*40rem/.test(a));
const reduce = (rule) => rule.at.some((a) => /prefers-reduced-motion:\s*reduce/.test(a));

// --- 1. the glass is always readable ---------------------------------------
const hex = (value) => value.match(/[0-9a-f]{2}/gi).map((h) => parseInt(h, 16));
const lum = (rgb) =>
  rgb
    .map((c) => c / 255)
    .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4))
    .reduce((sum, c, i) => sum + c * [0.2126, 0.7152, 0.0722][i], 0);
const contrast = (a, b) => {
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};
const tint = (root["--bar-tint"] ?? "").split(/\s+/).map(Number);
const alpha = Number(root["--bar-tint-alpha"]);
check.ok("อ่านค่าสีของกระจกจาก :root ได้", tint.length === 3 && alpha > 0 && alpha <= 1, JSON.stringify({ tint, alpha }));
// Blur only averages what is behind; the darkest it can be is black, the
// brightest white, and saturated colours sit between. Check all of them.
const behind = { ดำ: [0, 0, 0], ขาว: [255, 255, 255], แดง: [255, 0, 0], น้ำเงิน: [0, 0, 255], เขียว: [0, 128, 0] };
const glassOver = (b) => b.map((c, i) => alpha * tint[i] + (1 - alpha) * c);
for (const name of ["--bar-text", "--bar-text-muted"]) {
  const text = hex(root[name] ?? "#");
  const worst = Math.min(...Object.values(behind).map((b) => contrast(text, glassOver(b))));
  check.ok(
    `🔴 ${name} บนกระจก อ่านออกไม่ว่าข้างหลังเป็นอะไร (≥ 4.5:1)`,
    worst >= 4.5,
    `worst ${worst.toFixed(2)}:1`,
  );
  check.ok(`${name} บนพื้นทึบสำรอง อ่านออก`, contrast(text, hex(root["--bar-solid"] ?? "#")) >= 4.5);
}
check.ok("กระจกไม่ใส: มีสีรองอย่างน้อยครึ่งหนึ่ง", alpha >= 0.5, `alpha ${alpha}`);
const glass = rules.find((r) => r.selector === ".glass-bar" && phone(r) && !r.at.some((a) => a.startsWith("@supports")));
check.ok(
  "กระจกใช้สีรอง + เบลอ ทั้งแบบมาตรฐานและแบบ Safari",
  !!glass && /var\(--bar-tint-alpha\)/.test(glass.decls.background ?? "") &&
    /blur\(/.test(glass.decls["backdrop-filter"] ?? "") && /blur\(/.test(glass.decls["-webkit-backdrop-filter"] ?? ""),
);
const fallback = rules.find((r) => r.selector === ".glass-bar" && r.at.some((a) => /@supports not/.test(a)));
check.eq("เครื่องที่เบลอไม่ได้ ใช้พื้นทึบ ไม่ใช่ใสล้วน", fallback?.decls.background, "var(--bar-solid)");
const glassUses = (source("components/nav/MobileNav.tsx").match(/\bglass-bar\b/g) ?? []).length;
check.eq("กระจกใช้กับแถบบนและแถบล่างเท่านั้น (2 ที่)", glassUses, 2);

// --- 2. the lift and the dip are transform only ----------------------------
const STATE = /\.tab-item(:active|\[aria-current="page"\]|\[data-open\])/;
const ALLOWED = new Set(["transform", "color", "font-weight", "text-decoration", "text-underline-offset", "text-decoration-thickness"]);
const stateRules = rules.filter((r) => STATE.test(r.selector) && !reduce(r));
check.ok("อ่านกฎของสถานะปุ่มได้", stateRules.length >= 3, `${stateRules.length} rules`);
check.eq(
  "🔴 ตอนเลือก/ตอนกด เปลี่ยนแค่ transform และหน้าตาตัวหนังสือ ไม่แตะขนาดกล่อง",
  stateRules.flatMap((r) => Object.keys(r.decls).filter((p) => !ALLOWED.has(p)).map((p) => `${r.selector} { ${p} }`)),
  [],
);
check.ok(
  "การขยายและการยุบเป็นฟังก์ชัน transform ล้วน",
  [root["--tab-raise"], root["--tab-press"]].every((v) => v && /^(\s*(scale|translate[XY]?)\([^)]*\))+\s*$/.test(v)),
);
check.ok("ปุ่มที่เลือกขยายขึ้น ไม่ใช่หด", Number(root["--tab-raise"]?.match(/scale\(([\d.]+)\)/)?.[1]) > 1);
const tabItem = rules.find((r) => r.selector === ".tab-item" && phone(r));
check.ok("ปุ่มทุกปุ่มแบ่งความกว้างเท่ากัน (flex: 1) ขนาดไม่ขึ้นกับสถานะ", tabItem?.decls.flex === "1");

// --- 3. where you are is said in words too (D34) ---------------------------
const current = rules.find((r) => r.selector === '.tab-item[aria-current="page"] .tab-label');
check.ok(
  "หน้าที่อยู่บอกด้วยตัวหนาและเส้นใต้ ไม่ใช่การเคลื่อนไหวหรือสีอย่างเดียว",
  current?.decls["font-weight"] === "700" && /underline/.test(current?.decls["text-decoration"] ?? ""),
);
const mobile = source("components/nav/MobileNav.tsx");
check.ok("ทุกปุ่มในแถบล่างมีคำกำกับ ไม่ใช่ไอคอนเปล่า", /<span className="tab-label">\{tab\.label\}<\/span>/.test(mobile) && /<span className="tab-label">เมนู<\/span>/.test(mobile));
check.ok("พื้นที่กดของปุ่มแถบล่างสูงอย่างน้อย 44px", parseFloat(root["--tab-bar-height"]) * 16 >= 44);

// --- 4. short, and nothing at all under reduced motion ---------------------
const ms = (value) => (/ms$/.test(value) ? parseFloat(value) : parseFloat(value) * 1000);
check.ok("การเคลื่อนไหวสั้น ไม่เกิน 300ms", ms(root["--nav-motion"] ?? "") <= 300, root["--nav-motion"]);
check.ok("การเลื่อนเปลี่ยนหน้าสั้น ไม่เกิน 300ms", ms(root["--nav-slide"] ?? "") <= 300, root["--nav-slide"]);
check.eq(
  "ไม่มีเวลาเคลื่อนไหวตัวเลขตายตัวเกิน 300ms ในกฎของการนำทาง",
  rules
    .filter((r) => /\.tab-|::view-transition/.test(r.selector))
    .flatMap((r) => [r.decls.transition, r.decls.animation].filter(Boolean))
    .flatMap((value) => value.match(/\d+(\.\d+)?m?s\b/g) ?? [])
    .filter((value) => ms(value) > 300),
  [],
);
const moves = (value) => value && !/^none( !important)?$/.test(value);
// What counts as movement under reduced motion:
//   - any transition or animation, except one that only hides (skeleton-wait
//     sets visibility — nothing travels);
//   - a transform only where a state change would make it jump (the tab
//     lift and the press). The sheet's transform is its drag position under
//     the finger, not movement of its own.
// One named exception: the menu arrow's quarter turn IS the open/folded
// state (D34: shape, not colour). Under reduced motion it turns at once —
// its transition is removed — but it must still turn.
const HIDES_ONLY = /^skeleton-wait var\(--skeleton-wait\) linear$/;
const STATE_TRANSFORM = /\.tab-item(:active|\[aria-current="page"\]|\[data-open\])/;
const ARROW_IS_STATE = 'button[aria-expanded="true"] .group-chevron';
const isMovement = (rule, prop, value) =>
  moves(value) &&
  !(prop === "animation" && HIDES_ONLY.test(value)) &&
  !(prop === "transform" && (!STATE_TRANSFORM.test(rule.selector) || rule.selector === ARROW_IS_STATE));
const NAV_MOVERS = /\.tab-|::view-transition|\.menu-sheet|\.menu-backdrop|\.group-chevron|\[data-slot="skeleton"\]/;
const moving = rules.filter(
  (r) => !reduce(r) && NAV_MOVERS.test(r.selector) && ["transition", "animation", "transform"].some((p) => isMovement(r, p, r.decls[p])),
);
const stilled = rules.filter(reduce);
// ::view-transition-new(*) stills every ::view-transition-new(…), whatever its name.
const covers = (still, selector) =>
  still === selector ||
  (/^::view-transition-(old|new|group)\(\*\)$/.test(still) && selector.startsWith(still.replace("(*)", "(")));
const stillFor = (selector, prop) =>
  stilled.some(
    (r) =>
      r.selector.split(",").map((s) => s.trim()).some((still) => covers(still, selector)) &&
      (/^none( !important)?$/.test(r.decls[prop] ?? "") || (prop === "animation" && HIDES_ONLY.test(r.decls[prop] ?? ""))),
  );
const notStilled = moving.flatMap((r) =>
  r.selector.split(",").map((s) => s.trim()).flatMap((selector) =>
    ["transition", "animation", "transform"]
      .filter((p) => isMovement({ ...r, selector }, p, r.decls[p]) && !stillFor(selector, p))
      .map((p) => `${selector} { ${p} }`),
  ),
);
check.ok("เจอการเคลื่อนไหวที่ต้องตรวจ", moving.length >= 6, `${moving.length}`);
check.ok(
  "ลูกศรเมนูหมุนทันทีในโหมดลดการเคลื่อนไหว (ไม่มี transition) แต่ยังบอกสถานะ",
  stillFor(".group-chevron", "transition"),
);
check.eq("🔴 โหมดลดการเคลื่อนไหว ปิดการเคลื่อนไหวทุกตัว", notStilled, []);
check.ok(
  "โหมดลดการเคลื่อนไหว ปิดการเลื่อนเปลี่ยนหน้าด้วย",
  ["::view-transition-group(*)", "::view-transition-old(*)", "::view-transition-new(*)"].every((s) => stillFor(s, "animation")),
);

// --- 5. D78 round 2: what the iPhone video showed ---------------------------
// Pages never show through each other while sliding.
const vt = (kind, cls) => rules.find((r) => r.selector.split(",").map((s) => s.trim()).includes(`::view-transition-${kind}(.${cls})`) && r.decls["mix-blend-mode"]);
check.eq(
  "🔴 ระหว่างเลื่อนหน้า ห้ามผสมสองหน้าเข้าด้วยกัน (mix-blend-mode: normal)",
  [vt("old", "nav-forward"), vt("new", "nav-forward"), vt("old", "nav-back"), vt("new", "nav-back")].map((r) => r?.decls["mix-blend-mode"]),
  ["normal", "normal", "normal", "normal"],
);
const zOf = (selector) => Number(rules.find((r) => r.selector === selector && r.decls["z-index"])?.decls["z-index"] ?? 0);
check.ok("ไปข้างหน้า: หน้าใหม่อยู่บนหน้าเก่า", zOf("::view-transition-new(.nav-forward)") > zOf("::view-transition-old(.nav-forward)"));
check.ok("ย้อนกลับ: หน้าที่กำลังออกอยู่บนหน้าแม่", zOf("::view-transition-old(.nav-back)") > zOf("::view-transition-new(.nav-back)"));
const surface = rules.find((r) => r.selector === ".page-surface" && r.decls.background);
check.eq("🔴 หน้าที่เลื่อนมีพื้นทึบ", surface?.decls.background, "var(--page-bg)");
check.ok(
  "พื้นของหน้าที่เลื่อน เป็นสีเดียวกับพื้นของแอป (ไม่เป็นแผ่นขาวมีขอบเทา)",
  root["--page-bg"] === "var(--color-slate-50)" && /<body className="[^"]*\bbg-slate-50\b/.test(source("app/layout.tsx")),
  root["--page-bg"],
);
check.ok("หน้าทุกหน้าห่อด้วยพื้นทึบตอนเลื่อน", /<div className="page-surface">\{children\}<\/div>/.test(source("components/nav/PageSlide.tsx")));
check.ok("หน้าเก่าหรี่ลงตอนถูกทับ", /filter:\s*var\(--nav-dim\)/.test(css) && /brightness\(/.test(root["--nav-dim"] ?? ""));
const ease = (root["--nav-ease"] ?? "").match(/cubic-bezier\(([^)]+)\)/)?.[1].split(",").map(Number) ?? [];
check.ok(
  "เส้นโค้งความเร็วแบบ iOS: เริ่มเร็ว ค่อย ๆ ช้าลงตอนจบ",
  ease.length === 4 && ease[1] / Math.max(ease[0], 0.01) > 1.5 && ease[3] >= 0.99 && ease[2] < 0.5,
  root["--nav-ease"],
);
// Grey boxes only when loading is slow.
const wait = ms(root["--skeleton-wait"] ?? "");
check.ok("กล่องโหลดสีเทารอราว 300ms ก่อนขึ้น", wait >= 250 && wait <= 400, root["--skeleton-wait"]);
const skeleton = rules.find((r) => r.selector === '[data-slot="skeleton"]' && phone(r));
check.ok("กล่องโหลดซ่อนไว้ช่วงรอ ด้วย animation ที่ใช้ค่ารอกลาง", /skeleton-wait var\(--skeleton-wait\)/.test(skeleton?.decls.animation ?? ""));
check.ok("ช่วงรอคือซ่อน (visibility) ไม่ใช่การเคลื่อนไหว", /@keyframes skeleton-wait\s*\{\s*from,\s*to\s*\{\s*visibility:\s*hidden;\s*\}\s*\}/.test(css));
// The bar: icon and word close together, the home-bar space added once.
const barHeight = parseFloat(root["--tab-bar-height"]) * 16;
check.ok("แถบล่างไม่สูงเกิน: 44–56px ต่อปุ่ม", barHeight >= 44 && barHeight <= 56, `${barHeight}px`);
check.eq(
  "เว้นแถบโฮมของ iPhone ครั้งเดียว (ที่ตัวแถบ ไม่ใช่ในปุ่ม)",
  rules
    .filter((r) => r.selector.split(",").map((x) => x.trim()).some((x) => /^\.tab-(bar|item|icon|label)(\[|:|\s|$)/.test(x)))
    .filter((r) => Object.values(r.decls).some((v) => /safe-area-inset-bottom/.test(v)))
    .map((r) => r.selector),
  [".tab-bar"],
);
// Cards and margins from one place.
const cardList = rules.find((r) => r.selector === ".card-list" && phone(r));
check.eq("ระยะห่างระหว่างการ์ดมาจากตัวแปรกลาง", cardList?.decls.gap, "var(--card-gap)");
const gutter = rules.find((r) => r.selector === ".page-gutter" && phone(r));
check.eq("ระยะขอบซ้ายขวามาจากตัวแปรกลาง", gutter?.decls["padding-inline"], "var(--page-gutter)");
check.ok("ทุกหน้าในแอปใช้ระยะขอบกลาง", /<main className="[^"]*\bpage-gutter\b/.test(source("app/(app)/layout.tsx")));
const table = source("components/common/DataTable.tsx");
check.ok("ตารางเป็นการ์ดบนมือถือ", /<ul className="card-list sm:hidden"/.test(table));
check.ok("จอคอมยังเป็นตารางเหมือนเดิม", /<div className="hidden overflow-x-auto [^"]*sm:block">\s*<Table>/.test(table));
check.ok("การ์ดหนึ่งใบต่อหนึ่งแถว ชื่อเด่นบรรทัดบน", /rows\.map\(\(row\) => \(\s*<li/.test(table) && /font-semibold[^"]*">\{title\.cell\(row\)\}/.test(table));
// Home: bigger, no new data (rule 60).
const home = source("app/(app)/page.tsx");
check.eq("หน้าแรกไม่ได้ดึงข้อมูลใหม่เพิ่ม (มีแค่การตรวจการเชื่อมต่อ)", (home.match(/useSection\(/g) ?? []).length, 1);
check.ok("ปุ่มงานหน้าแรกเต็มพื้นที่ระหว่างแถบบนกับแถบล่าง", /\.home-tasks \{[^}]*min-height: calc\(100dvh/.test(css));

// --- 6. the user's "too cramped, make it an app" (walk-through, 18 Nov) ------
// The font: @theme said --font-sans: var(--font-sans) — itself, so invalid —
// and every screen fell back to Times New Roman from Phase 5.1 on.
const themeSans = css.match(/@theme inline \{[\s\S]*?--font-sans:\s*([^;]+);/)?.[1] ?? "";
const rootLayout = source("app/layout.tsx");
const loadedAs = rootLayout.match(/Noto_Sans_Thai\(\{[\s\S]*?variable:\s*"(--[\w-]+)"/)?.[1] ?? "";
check.ok("อ่านชื่อฟอนต์ที่โหลดจริงได้", loadedAs !== "", "Noto_Sans_Thai variable not found");
check.ok(
  "🔴 ฟอนต์หลักชี้ไปที่ฟอนต์ไทยที่โหลดจริง ไม่ใช่ชี้หาตัวเอง",
  themeSans.split(",")[0].trim() === `var(${loadedAs})` && !/var\(--font-sans\)/.test(themeSans),
  themeSans,
);
// A page heading that only repeats the top bar is hidden on a phone — and
// only that one: the decision is made by comparing with the top bar's title.
const header = source("components/common/PageHeader.tsx");
check.ok("หัวข้อหน้าซ่อนเฉพาะเมื่อซ้ำกับแถบบน", /const repeatsTopBar = routeFor\(usePathname\(\)\)\?\.title === title;/.test(header));
check.ok(
  "หัวข้อที่ซ่อนยังอ่านได้ด้วยโปรแกรมอ่านจอ และยังแสดงบนจอคอม",
  /repeatsTopBar \? "sr-only [^"]*sm:not-sr-only"/.test(header),
);
// Filter buttons: one row of chips that scrolls, never wrapping a label.
const chipRule = rules.find((r) => r.selector === ".chip-row" && phone(r));
const chipButton = rules.find((r) => r.selector === '.chip-row > [data-slot="button"]' && phone(r));
check.ok(
  "ปุ่มกรองเรียงแถวเดียว เลื่อนข้างได้ ไม่ตัดคำ",
  chipRule?.decls["flex-wrap"] === "nowrap" && chipRule?.decls["overflow-x"] === "auto" && chipButton?.decls["white-space"] === "nowrap",
);
check.eq(
  "ทุกแถวปุ่มกรองในแอปใช้แถวชิปเดียวกัน",
  [source("components/stock/StockFilters.tsx"), source("app/(app)/history/purchases/page.tsx")]
    .map((text) => (text.match(/<div className="([^"]*)" role="group"/) ?? [])[1] ?? "")
    .map((cls) => /\bchip-row\b/.test(cls)),
  [true, true],
);
check.ok("ขอบซ้ายขวาอย่างน้อย 20px แบบ iOS", parseFloat(root["--page-gutter"]) * 16 >= 20, root["--page-gutter"]);

process.exit(check.done() ? 1 : 0);
