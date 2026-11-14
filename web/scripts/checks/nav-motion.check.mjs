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
const moving = rules.filter(
  (r) => !reduce(r) && /\.tab-|::view-transition/.test(r.selector) && [r.decls.transition, r.decls.animation, r.decls.transform].some(moves),
);
const stilled = rules.filter(reduce);
// ::view-transition-new(*) stills every ::view-transition-new(…), whatever its name.
const covers = (still, selector) =>
  still === selector ||
  (/^::view-transition-(old|new|group)\(\*\)$/.test(still) && selector.startsWith(still.replace("(*)", "(")));
const stillFor = (selector, prop) =>
  stilled.some(
    (r) => r.selector.split(",").map((s) => s.trim()).some((still) => covers(still, selector)) && /^none( !important)?$/.test(r.decls[prop] ?? ""),
  );
const notStilled = moving.flatMap((r) =>
  r.selector.split(",").map((s) => s.trim()).flatMap((selector) =>
    ["transition", "animation", "transform"].filter((p) => moves(r.decls[p]) && !stillFor(selector, p)).map((p) => `${selector} { ${p} }`),
  ),
);
check.ok("เจอการเคลื่อนไหวที่ต้องตรวจ", moving.length >= 4, `${moving.length}`);
check.eq("🔴 โหมดลดการเคลื่อนไหว ปิดการเคลื่อนไหวทุกตัว", notStilled, []);
check.ok(
  "โหมดลดการเคลื่อนไหว ปิดการเลื่อนเปลี่ยนหน้าด้วย",
  ["::view-transition-group(*)", "::view-transition-old(*)", "::view-transition-new(*)"].every((s) => stillFor(s, "animation")),
);

process.exit(check.done() ? 1 : 0);
