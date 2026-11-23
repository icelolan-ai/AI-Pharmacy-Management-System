/** Nothing at the bottom of a page hides under the tab bar or the raised
 *  ขายยา disc — not even 1px (Chat A, after the 6.4 walk-through: the last
 *  button of a long page sat 5px under the disc).
 *
 *  Measured at 375px (24 Nov 2569, /history/sales scrolled to the end):
 *    before: page space 76px, the last line ended 5px BELOW the disc's top
 *    after:  page space 110px, the last line ends 29px above it
 *
 *  What is checked here, from the CSS itself:
 *  1. the page's bottom space is built from the same variables that draw the
 *     bar and the disc (so changing either moves the space with it — no
 *     number to remember);
 *  2. the disc really is drawn from those variables;
 *  3. with today's values, the space above the bar is at least the most the
 *     disc can rise: half its size plus its lift (it is centred inside the
 *     bar, then lifted).
 */

import { createChecker, source } from "./lib.mjs";

const check = createChecker("ช่องว่างล่างหน้า — แถบล่างและปุ่มขายยาไม่ทับเนื้อหา");
const css = source("app/globals.css").replace(/\r\n/g, "\n");

const clearance = /\.tab-bar-clearance\s*\{\s*padding-bottom:\s*calc\(([\s\S]*?)\);\s*\}/.exec(css)?.[1] ?? "";
check.ok("พบกฎช่องว่างล่างหน้า (ตัวสแกนไม่ได้ว่างเปล่า)", clearance.length > 0);
for (const part of ["var(--tab-bar-height)", "env(safe-area-inset-bottom)", "var(--tab-center)", "var(--tab-center-lift)"]) {
  check.ok(`🔴 ช่องว่างล่างหน้าคิดจาก ${part}`, clearance.includes(part));
}
check.ok("ไม่มีเลขตายตัวในสูตร นอกจากหารครึ่ง", !/\d+(\.\d+)?(px|rem)/.test(clearance));

const disc = /\.tab-center-disc\s*\{([\s\S]*?)\}/.exec(css)?.[1] ?? "";
check.ok("ปุ่มขายยาวาดจากขนาด --tab-center", /width:\s*var\(--tab-center\)/.test(disc) && /height:\s*var\(--tab-center\)/.test(disc));
check.ok("ปุ่มขายยายกขึ้นด้วย --tab-center-lift", /translateY\(calc\(-1 \* var\(--tab-center-lift\)\)\)/.test(disc));

const rem = (name) => {
  const value = new RegExp(`--${name}:\\s*([\\d.]+)rem`).exec(css)?.[1];
  return value === undefined ? NaN : Number(value) * 16;
};
const size = rem("tab-center");
const lift = rem("tab-center-lift");
const gap = rem("tab-gap-above");
const reservedAboveBar = (clearance.includes("var(--tab-center) / 2") ? size / 2 : 0)
  + (clearance.includes("var(--tab-center-lift)") ? lift : 0)
  + (clearance.includes("var(--tab-gap-above)") ? gap : 0);
const mostTheDiscRises = size / 2 + lift;
check.ok(
  `🔴 ที่เว้นเหนือแถบ (${reservedAboveBar}px) ไม่น้อยกว่าที่ปุ่มขายยายกขึ้นได้มากที่สุด (${mostTheDiscRises}px) + อากาศ ≥ 1px`,
  reservedAboveBar - mostTheDiscRises >= 1,
);

const layout = source("app/(app)/layout.tsx");
check.ok("หน้าทุกหน้าอยู่ใน <main> ที่ใช้กฎนี้", /<main className="tab-bar-clearance/.test(layout));

process.exit(check.done() ? 1 : 0);
