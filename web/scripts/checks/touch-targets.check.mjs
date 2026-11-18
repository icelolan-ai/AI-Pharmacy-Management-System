/** Every link a finger can press on a phone is at least 44px tall (D47).
 *
 *  Buttons, inputs and selects get 44px from globals.css. A <Link> or <a>
 *  does not: it is as tall as its line of text, ~20px — the "ไปหน้าคลังยา"
 *  link in ประวัติการขาย was one, found in the D78 walk-through, and three
 *  more like it were found by this scan. So every link in src must say how
 *  it reaches 44px: min-h-11 (or more), or a class whose 44px is in
 *  globals.css. A link that never shows on a phone is listed by name, with
 *  the reason.
 */

import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { createChecker, SRC, source } from "./lib.mjs";

const check = createChecker("ลิงก์ทุกอันบนมือถือสูงอย่างน้อย 44px (D47)");

const css = source("app/globals.css");
const remOf = (selector) => {
  const block = css.match(new RegExp(`\\${selector}\\s*\\{([^}]*)\\}`))?.[1] ?? "";
  const value = block.match(/min-height:\s*([^;]+);/)?.[1]?.trim() ?? "0";
  // min-height: var(--tab-bar-height) — follow it to its :root value.
  const name = value.match(/^var\((--[\w-]+)\)$/)?.[1];
  const resolved = name ? (css.match(new RegExp(`${name}:\\s*([^;]+);`))?.[1] ?? "0") : value;
  return parseFloat(resolved);
};
/** Classes whose height globals.css sets — checked here, not assumed. */
const CSS_TALL = [".back-link", ".tab-item", ".home-task"];
for (const cls of CSS_TALL) check.ok(`${cls} สูงอย่างน้อย 44px ใน globals.css`, remOf(cls) * 16 >= 44, `${remOf(cls)}rem`);

/** Links that are never on a phone screen. */
const DESKTOP_ONLY = {
  "components/store/SideNavStoreName.tsx": "อยู่ในแถบข้างของจอคอม (hidden … sm:block) ไม่เคยขึ้นบนมือถือ",
};
// The menu's links: their height is a constant in AppNav, checked below.
const APPNAV = "components/nav/AppNav.tsx";

const files = (function walk(dir, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (entry.name.endsWith(".tsx")) out.push(full);
  }
  return out;
})(SRC);

const tall = /\bmin-h-(1[1-9]|[2-9]\d)\b/;
const short = [];
let seen = 0;
for (const full of files) {
  const rel = relative(SRC, full).replace(/\\/g, "/");
  const text = readFileSync(full, "utf8");
  for (const match of text.matchAll(/<(Link|a)\b([^>]*)>/g)) {
    seen += 1;
    const attrs = match[2];
    const where = `${rel}:${text.slice(0, match.index).split("\n").length}`;
    if (rel in DESKTOP_ONLY || rel === APPNAV) continue;
    const cls = attrs.match(/className=\{?"([^"]*)"/)?.[1] ?? attrs.match(/className="([^"]*)"/)?.[1];
    if (cls === undefined) {
      // A computed class: the bottom bar's tabs are the only one allowed.
      if (rel === "components/nav/MobileNav.tsx" && /className="tab-item"/.test(text)) continue;
      short.push(`${where} (class worked out in code — say how it reaches 44px)`);
      continue;
    }
    const classes = cls.split(/\s+/);
    if (tall.test(cls) || CSS_TALL.some((c) => classes.includes(c.slice(1)))) continue;
    short.push(`${where} "${cls}"`);
  }
}
check.ok("สแกนพบลิงก์จริง (ตัวสแกนไม่ได้ว่างเปล่า)", seen >= 10, `found ${seen}`);
check.eq("ไม่มีลิงก์ที่เตี้ยกว่า 44px บนมือถือ", short, []);

const appNav = source(APPNAV);
check.ok(
  "ลิงก์ในเมนูใช้ความสูงขั้นต่ำเดียวกันทุกอัน และไม่ต่ำกว่า 44px",
  /const ROW_MIN_HEIGHT = "min-h-(1[1-9]|[2-9]\d)";/.test(appNav) && /<Link[\s\S]{0,900}?ROW_MIN_HEIGHT,/.test(appNav),
);
check.ok(
  "ลิงก์ในประโยคยังสูง 44px บนมือถือ: ไปหน้าคลังยา ในประวัติการขาย",
  /<Link href="\/stock" className="[^"]*\binline-flex\b[^"]*\bmin-h-11\b[^"]*">\s*ไปหน้าคลังยา/.test(source("app/(app)/history/sales/page.tsx")),
);

process.exit(check.done() ? 1 : 0);
