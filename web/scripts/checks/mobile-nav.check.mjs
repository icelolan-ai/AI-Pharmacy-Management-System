/** U-4 / D34: a phone must be able to leave the page it is on.
 *
 *  The sidebar was hidden below the `sm` breakpoint with nothing in its place,
 *  so a phone rendered zero navigation links. Whatever page you opened, you
 *  stayed on it — the only controls were "ออกจากระบบ" and whatever that page
 *  offered. That is the regression this file exists to stop coming back.
 *
 *  D34 also applies: large touch targets, and colour may never be the only
 *  thing carrying meaning.
 */

import { createChecker, source } from "./lib.mjs";

const check = createChecker("U-4 — มือถือต้องมีทางไปหน้าอื่น");

const layout = source("app/(app)/layout.tsx");
const mobile = source("components/nav/MobileNav.tsx");
const nav = source("components/nav/AppNav.tsx");

// --- 1. the sidebar is still desktop-only, and something replaces it -------
check.ok(
  "แถบข้างยังซ่อนบนจอเล็กเหมือนเดิม",
  /<aside className="hidden[^"]*sm:block"/.test(layout),
  "the desktop sidebar changed shape; re-check what the phone shows",
);
check.ok(
  "จอเล็กมี MobileNav มาแทนแถบข้าง",
  /<MobileNav groups=\{MENU\}/.test(layout),
  "🔴 nothing replaces the hidden sidebar — a phone would have no links at all",
);
check.ok(
  "MobileNav แสดงเฉพาะจอเล็ก",
  /className="sm:hidden"/.test(mobile),
  "it would double up with the sidebar on a wide screen",
);

// --- 2. both surfaces read the SAME list ----------------------------------
// Two hand-maintained copies would drift, and the phone would be the one left
// behind — exactly how this bug happened the first time.
check.ok(
  "แถบข้างและเมนูมือถือใช้รายการเดียวกัน (MENU)",
  // Counted rather than matched on one line: breaking the JSX across lines
  // for readability broke the old pattern while the property — both surfaces
  // fed from MENU — was perfectly intact.
  /<AppNav[\s>]/.test(layout)
    && /<MobileNav[\s>]/.test(layout)
    && (layout.match(/groups=\{MENU\}/g) ?? []).length === 2,
);
check.ok(
  "ตัวกรองสิทธิ์อยู่ที่เดียว ใน AppNav",
  /export function visibleItems/.test(nav) && !/MENU\.filter/.test(layout),
  "filtering in the layout again would let the two menus disagree",
);
check.ok(
  "เมนูมือถือ render ด้วย AppNav ตัวเดียวกัน",
  /<AppNav[\s\S]{0,200}variant="panel"/.test(mobile),
);

// --- 3. D34: words, not just colour; and targets big enough ---------------
check.ok(
  "ปุ่มเปิดเมนูมีคำว่า “เมนู” ไม่ใช่ไอคอนเปล่า",
  /เมนู\s*\n?\s*<\/Button>/.test(mobile) || />\s*เมนู\s*</.test(mobile),
  "D34: an icon alone leaves an older user guessing",
);
check.ok(
  "หน้าที่กำลังดูอยู่บอกด้วยข้อความ ไม่ใช่สีอย่างเดียว",
  // Between tags, not merely somewhere in the file: an earlier draft of this
  // assertion matched the word inside the doc comment above and passed while
  // the label itself had been deleted.
  />\s*กำลังดูอยู่\s*</.test(nav),
  "D34: colour may not be the only thing carrying meaning",
);
check.ok(
  "แถวเมนูบนมือถือสูงพอสำหรับนิ้ว",
  // Read as a number from the shared constant (D43-b). D44 moved the height
  // out of a per-variant expression and onto every row including the group
  // headings, which is stronger — but it broke a pattern tied to the old shape.
  (() => {
    const constant = nav.match(/const ROW_MIN_HEIGHT = "min-h-(\d+)"/);
    return constant !== null && Number(constant[1]) * 4 >= 48;
  })(),
  "D34: touch targets must be large enough",
);
check.ok(
  "ปุ่มเปิดและปุ่มปิดสูงพอสำหรับนิ้ว",
  (mobile.match(/min-h-11/g) ?? []).length >= 2,
);
check.ok(
  "ปุ่มปิดเป็นคำว่า “ปิด” ไม่ใช่กากบาทเปล่า",
  />\s*ปิด\s*</.test(mobile),
);

// --- 4. it behaves like a dialog and closes properly ----------------------
check.ok(
  "แผงเมนูประกาศตัวเป็น dialog และมีชื่อกำกับ",
  /role="dialog"/.test(mobile) && /aria-modal="true"/.test(mobile) && /aria-label="เมนูหลัก"/.test(mobile),
);
check.ok(
  "กด Escape แล้วปิด",
  /event\.key === "Escape"/.test(mobile) && /onClose\(\)/.test(mobile),
);
check.ok(
  "กดลิงก์แล้วเมนูปิดเอง ไม่ค้างทับหน้าใหม่",
  /onNavigate=\{onClose\}/.test(mobile) && /onClick=\{onNavigate\}/.test(nav),
  "the panel would stay over the page the user just asked for",
);
check.ok(
  "แผงเมนู mount เฉพาะตอนเปิด",
  /\{open \? \(\s*<MobilePanel/.test(mobile),
  "kept for the same reason as every other dialog here: it opens clean",
);

// --- 5. "/" must not claim every page -------------------------------------
// Modelled, because getting this wrong marks every row as the current one.
function isCurrent(href, pathname) {
  return href === "/" ? pathname === "/" : pathname.startsWith(href);
}
check.eq("อยู่หน้าแรก: หน้าแรกถูกทำเครื่องหมาย", isCurrent("/", "/"), true);
check.eq("อยู่หน้าขายยา: หน้าแรกต้องไม่ถูกทำเครื่องหมายด้วย", isCurrent("/", "/sell"), false);
check.eq("อยู่หน้าขายยา: ขายยาถูกทำเครื่องหมาย", isCurrent("/sell", "/sell"), true);
check.eq(
  "อยู่หน้าย่อย: เมนูแม่ยังถูกทำเครื่องหมาย",
  isCurrent("/history/sales", "/history/sales/abc"),
  true,
);

process.exit(check.done() ? 1 : 0);
