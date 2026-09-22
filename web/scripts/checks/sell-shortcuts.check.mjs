/** Rules the sell screen must keep (docs/05-web-spec.md 5.4).
 *
 *  Checked here because a refactor can quietly drop a keyboard shortcut or the
 *  arming delay without breaking the build, and both are things the shop
 *  relies on at the counter.
 */

import { createChecker, source } from "./lib.mjs";

const check = createChecker("/sell — shortcuts and the confirm delay");
const page = source("app/(app)/sell/page.tsx");
const dialog = source("components/sell/ConfirmSaleDialog.tsx");

// --- F2 and Ctrl+Enter both open the confirm box ---------------------------
const shortcut = /event\.key === "F2" \|\| \(event\.ctrlKey && event\.key === "Enter"\)/;
check.ok("F2 และ Ctrl+Enter เปิดกล่องยืนยันทั้งคู่", shortcut.test(page));
check.ok("ทั้งสองปุ่มเรียก openConfirm ตัวเดียวกัน", /openConfirm\(\);/.test(page));
check.ok(
  "เขียนปุ่มลัดทั้งสองไว้บนหน้าจอ",
  /กด F2 หรือ Ctrl\+Enter/.test(page),
  "the spec requires both shortcuts to be written on screen",
);
check.ok("ไม่มี F1 (C-1)", !/"F1"/.test(page));
check.ok('"/" กลับไปช่องค้นหา', /event\.key === "\/"/.test(page));

// --- the confirm button is dead for the first 300ms ------------------------
check.ok("ปุ่มยืนยันตาย 300 ms แรก", /ARM_DELAY_MS = 300/.test(dialog));
check.ok(
  "ปุ่มถูก disable จนกว่าจะพ้น 300 ms",
  /disabled=\{!armed \|\| saving\}/.test(dialog),
  "the arming flag no longer gates the button",
);
check.ok(
  "armed เริ่มจาก false ทุกครั้งที่เปิด",
  /setArmed\(false\)/.test(dialog) && /setTimeout\(\(\) => setArmed\(true\), ARM_DELAY_MS\)/.test(dialog),
  "the delay no longer resets when the dialog opens",
);

// --- a failed save must say the stock was not touched, and keep the basket --
check.ok(
  "ข้อความล้มเหลวบอกว่ายังไม่มีการตัดสต็อก",
  /บันทึกการขายไม่สำเร็จ ยังไม่มีการตัดสต็อก กรุณาลองใหม่/.test(page),
);
const confirmSale = page.slice(page.indexOf("async function confirmSale"), page.indexOf("function printReceipt"));
check.ok(
  "ล้มเหลวแล้วไม่ล้างตะกร้า",
  !/catch[\s\S]*?cart\.clear\(\)/.test(confirmSale),
  "the basket is cleared on a failed save",
);
check.ok(
  "กดรัวได้บิลเดียว (มีตัวกันซ้ำ)",
  /if \(savingRef\.current\) return;/.test(confirmSale),
);

// --- the empty search box is derived, not cleared in an effect -------------
check.ok(
  "ช่องค้นหาว่าง = ไม่มีผล โดยไม่ต้อง setState ใน effect",
  /const results = term\.trim\(\) === "" \? EMPTY_RESULTS : fetched;/.test(page),
);

process.exit(check.done() ? 1 : 0);
