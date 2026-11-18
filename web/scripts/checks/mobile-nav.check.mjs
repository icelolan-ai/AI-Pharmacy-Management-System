/** U-4 / D34 / D47-3 (revised by D78): a phone must be able to leave the page it is on.
 *
 *  The sidebar was hidden below the `sm` breakpoint with nothing in its place,
 *  so a phone rendered zero navigation links. That is the regression this
 *  file exists to stop coming back.
 *
 *  D47-3 put the menu behind the shop's name in the top corner. D78 moved it
 *  to ☰ เมนู in the bottom bar, and the shop's name is now plain text. What
 *  D47-3 protected still holds and is still tested here: one control opens
 *  and closes the menu, Escape closes it, following a link closes it, and
 *  the panel is a proper dialog that opens clean.
 */

import { createChecker, source } from "./lib.mjs";

const check = createChecker("U-4 — มือถือต้องมีทางไปหน้าอื่น (D47-3 แก้โดย D78)");

const layout = source("app/(app)/layout.tsx");
const mobile = source("components/nav/MobileNav.tsx");
const nav = source("components/nav/AppNav.tsx");
const items = source("lib/nav/items.ts");

// --- 1. the sidebar is still desktop-only, and something replaces it -------
check.ok(
  "แถบข้างยังซ่อนบนจอเล็กเหมือนเดิม",
  /<aside className="hidden[^"]*sm:block"/.test(layout),
  "the desktop sidebar changed shape; re-check what the phone shows",
);
check.ok(
  "จอเล็กมี MobileNav มาแทนแถบข้าง",
  /<MobileNav\s+groups=\{MENU\}/.test(layout),
  "🔴 nothing replaces the hidden sidebar — a phone would have no links at all",
);
check.ok(
  "MobileNav แสดงเฉพาะจอเล็ก",
  /return \(\s*<div className="sm:hidden">/.test(mobile),
  "it would double up with the sidebar on a wide screen",
);

// --- 2. both surfaces read the SAME list ----------------------------------
check.ok(
  "แถบข้างและเมนูมือถือใช้รายการเดียวกัน (MENU)",
  /<AppNav[\s>]/.test(layout) && /<MobileNav[\s>]/.test(layout) && (layout.match(/groups=\{MENU\}/g) ?? []).length === 2,
);
check.ok(
  "ตัวกรองสิทธิ์อยู่ที่เดียว (lib/nav/items.ts) และ AppNav ใช้ตัวเดียวกัน",
  /export function visibleItems/.test(items) && /from "@\/lib\/nav\/items"/.test(nav) && !/MENU\.filter/.test(layout),
  "filtering in the layout again would let the two menus disagree",
);
check.ok("เมนูมือถือ render ด้วย AppNav ตัวเดียวกัน", /<AppNav[\s\S]{0,200}variant="panel"/.test(mobile));

// --- 3. D34: words, not just icons; and targets big enough ----------------
check.ok(
  "ปุ่มเมนูบอกเป็นคำ ทั้งที่ตาเห็นและที่โปรแกรมอ่านจอได้ยิน",
  /aria-label=\{open \? "ปิดเมนูหลัก" : "เปิดเมนูหลัก"\}/.test(mobile) && /<span className="tab-label">เมนู<\/span>/.test(mobile),
  "D34: an icon alone leaves an older user guessing",
);
check.ok(
  "หน้าที่กำลังดูอยู่ในเมนู บอกด้วยข้อความ ไม่ใช่สีอย่างเดียว",
  />\s*กำลังดูอยู่\s*</.test(nav),
  "D34: colour may not be the only thing carrying meaning",
);
check.ok(
  "แถวเมนูบนมือถือสูงพอสำหรับนิ้ว",
  (() => {
    const constant = nav.match(/const ROW_MIN_HEIGHT = "min-h-(\d+)"/);
    return constant !== null && Number(constant[1]) * 4 >= 48;
  })(),
);

// --- 4. one control for the menu (what D47-3 protected) ---------------------
check.eq(
  "มีปุ่มเปิด/ปิดเมนูปุ่มเดียว",
  (mobile.match(/onClick=\{\(\) => setOpen\(\(wasOpen\) => !wasOpen\)\}/g) ?? []).length,
  1,
);
check.ok("ไม่มีปุ่ม “ปิด” แยกอีกปุ่ม", !/>\s*ปิด\s*</.test(mobile));
// D78 round 2: the menu is a sheet that stops on top of the tab bar. The
// bar is drawn above the sheet and its dimmed backdrop, so ✕ still closes it.
{
  const css = source("app/globals.css").replace(/\/\*[\s\S]*?\*\//g, "");
  const z = (selector) => Number(css.match(new RegExp(`\\${selector} \\{[^}]*z-index:\\s*(\\d+)`))?.[1]);
  const barZ = Number(mobile.match(/className="glass-bar tab-bar fixed inset-x-0 bottom-0 z-\[(\d+)\]"/)?.[1]);
  check.ok(
    "แถบล่างอยู่เหนือแผ่นเมนูและพื้นหลังหรี่ ปุ่มเดิมจึงใช้ปิดได้",
    barZ > z(".menu-sheet") && barZ > z(".menu-backdrop"),
    `bar ${barZ}, sheet ${z(".menu-sheet")}, backdrop ${z(".menu-backdrop")}`,
  );
  check.ok(
    "แผ่นเมนูจบที่ขอบบนของแถบล่าง ไม่ทับแถบ",
    /\.menu-sheet \{[^}]*bottom: calc\(var\(--tab-bar-height\) \+ env\(safe-area-inset-bottom\)\)/.test(css),
  );
}
check.ok("กดนอกแผ่นเมนูแล้วปิด", /<div aria-hidden="true" className="menu-backdrop" onClick=\{onClose\} \/>/.test(mobile));
check.ok(
  "ปัดแผ่นเมนูลงเกินระยะแล้วปิด",
  /if \(drag && drag\.dy > DISMISS_PX\) onClose\(\);/.test(mobile) && /const DISMISS_PX = (\d+);/.test(mobile),
);
check.ok(
  "เมนูมือถือไม่ซ้ำกับแถบล่าง: ใช้ตัวกรองเดียวกับแถบล่าง",
  /exclude=\{hrefsOnTabBar\(role\)\}/.test(mobile),
);
check.ok(
  "เมนูจอคอมยังครบ: แถบข้างไม่ได้ตัดอะไรออก",
  /<AppNav\s+groups=\{MENU\}[^>]*variant="sidebar"/.test(source("app/(app)/layout.tsx").replace(/\s+/g, " ")) &&
    !/variant="sidebar"[^>]*exclude=/.test(source("app/(app)/layout.tsx").replace(/\s+/g, " ")),
);
check.ok("ชื่อร้านไม่ใช่ปุ่มแล้ว (D47-3 แก้โดย D78)", !/StoreNameButton/.test(mobile));

// --- 5. it behaves like a dialog and closes properly ----------------------
check.ok(
  "แผงเมนูประกาศตัวเป็น dialog และมีชื่อกำกับ",
  /role="dialog"/.test(mobile) && /aria-modal="true"/.test(mobile) && /aria-label="เมนูหลัก"/.test(mobile),
);
check.ok("กด Escape แล้วปิด", /event\.key === "Escape"\) onClose\(\)/.test(mobile));
check.ok(
  "กดลิงก์ในเมนูแล้วเมนูปิดเอง",
  /onNavigate=\{onClose\}/.test(mobile) && /onClick=\{onNavigate\}/.test(nav),
  "the panel would stay over the page the user just asked for",
);
check.ok("กดปุ่มในแถบล่างตอนเมนูเปิด เมนูปิดด้วย", /href=\{tab\.href\}[\s\S]{0,120}onClick=\{\(event\) => \{\s*setOpen\(false\);/.test(mobile));
check.ok("แผงเมนู mount เฉพาะตอนเปิด", /\{open \? \(\s*<MobilePanel/.test(mobile));
check.ok(
  "ชื่อผู้ใช้และปุ่มออกจากระบบย้ายไปอยู่ในเมนู",
  /signed\.name/.test(mobile) && />\s*ออกจากระบบ\s*</.test(mobile),
);

// --- 6. "/" must not claim every page -------------------------------------
// The real isCurrent from lib/nav/items.ts is not React, so it is run as is.
const { loadTs } = await import("./load-ts.mjs");
const { isCurrent } = await loadTs("lib/nav/items");
check.eq("อยู่หน้าแรก: หน้าแรกถูกทำเครื่องหมาย", isCurrent("/", "/"), true);
check.eq("อยู่หน้าขายยา: หน้าแรกต้องไม่ถูกทำเครื่องหมายด้วย", isCurrent("/", "/sell"), false);
check.eq("อยู่หน้าขายยา: ขายยาถูกทำเครื่องหมาย", isCurrent("/sell", "/sell"), true);
check.eq("อยู่หน้าย่อย: เมนูแม่ยังถูกทำเครื่องหมาย", isCurrent("/history/sales", "/history/sales/abc"), true);

process.exit(check.done() ? 1 : 0);
