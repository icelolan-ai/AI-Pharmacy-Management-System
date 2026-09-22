/** Regression guard for a real bug on /stock/[id].
 *
 *  The page loads the medicine, its lots, its value and one lot's history.
 *  Opening the adjust dialog fires a further GET /lots/{id} (D23 requires the
 *  quantity to be freshly read). All of that once shared ONE error slot, so a
 *  failure while opening the dialog overwrote the page's own state and the
 *  medicine, its lots and its cards all vanished behind the dialog.
 *
 *  The fix gives the dialog's failure its own slot. What must hold:
 *    - the page's content comes from the section's data, not from state that
 *      the dialog's catch block can clear;
 *    - the dialog's catch writes only to its own slot;
 *    - both errors still reach the screen.
 */

import { createChecker, source } from "./lib.mjs";

const check = createChecker("/stock/[id] — a failed dialog open must not blank the page");
const page = source("app/(app)/stock/[id]/page.tsx");

// --- the two error slots are separate --------------------------------------
check.ok(
  "มีช่องเก็บ error ของ dialog แยกต่างหาก",
  /const \[openError, setOpenError\]/.test(page),
  "openError state is gone — the dialog would share the page's error slot again",
);

const openAdjust = page.slice(page.indexOf("async function openAdjust"), page.indexOf("const unit ="));
check.ok(
  "catch ของการเปิด dialog เขียนลงช่องของตัวเองเท่านั้น",
  /setOpenError\(/.test(openAdjust) && !/\bsetError\(/.test(openAdjust),
  "openAdjust writes to the page error again",
);
check.ok(
  "catch ของการเปิด dialog ไม่ล้างข้อมูลหน้า",
  !/setMedicine\(|setLots\(|setDetail\(/.test(openAdjust),
  "openAdjust clears page content on failure",
);

// --- the page's content is read from the section, so nothing else can clear it
for (const [label, pattern] of [
  ["medicine", /const medicine = detail\.data\?\.medicine/],
  ["lots", /const lots = detail\.data\?\.lots/],
  ["transactions", /const transactions = detail\.data\?\.transactions/],
  ["stockRow", /const stockRow = detail\.data\?\.stockRow/],
]) {
  check.ok(`${label} มาจาก detail.data (dialog แตะไม่ได้)`, pattern.test(page));
}

// --- both failures still surface -------------------------------------------
check.ok(
  "หน้าจอแสดง error ของ dialog ด้วย ไม่ใช่กลืนเงียบ",
  /const error = openError \?\? detail\.error/.test(page),
  "the dialog's error no longer reaches the screen",
);

// --- and the D23 reload before opening is still there ----------------------
check.ok(
  "ยัง reload ล็อตก่อนเปิด dialog ตาม D23",
  /await getLot\(lot\.id\)/.test(openAdjust),
  "the fresh read before opening the dialog has gone — D23 would be broken",
);

process.exit(check.done() ? 1 : 0);
