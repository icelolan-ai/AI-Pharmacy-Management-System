/** D23: a stock adjustment rejected with 409 must not cost the user their work.
 *
 *  The backend refuses when the quantity moved while the dialog was open. The
 *  dialog then has to stay open, keep the counted quantity, the reason and the
 *  note exactly as typed, show the fresh number to count against, and let the
 *  user press save again without retyping anything.
 *
 *  This is the check Chat A required before AdjustStockDialog could be touched
 *  by the lint cleanup, because the obvious fix for the warning — remounting
 *  the dialog to reset it — would wipe those fields on every 409.
 */

import { createChecker, source } from "./lib.mjs";

const check = createChecker("D23 — a 409 keeps what was typed");
const dialog = source("components/stock/AdjustStockDialog.tsx");

// --- 1. the state machine, modelled as the dialog implements it ------------
function createDialogState(lot) {
  return {
    current: lot.quantity_remaining,
    counted: String(lot.quantity_remaining),
    reason: null,
    note: "",
    error: null,
    open: true,
  };
}

/** What the 409 branch does: message, fresh quantity, nothing else touched. */
function onStaleConflict(state, freshQuantity) {
  return {
    ...state,
    error: "จำนวนคงเหลือเปลี่ยนไประหว่างที่เปิดหน้าต่างนี้ กรุณาตรวจนับใหม่",
    current: freshQuantity,
  };
}

let state = createDialogState({ quantity_remaining: 18 });
// the user counts 17, picks a reason, writes a note
state = { ...state, counted: "17", reason: "stock_count", note: "นับใหม่แล้วขาด 1" };
// meanwhile someone sold 2, so the save comes back 409 and the real stock is 16
const after = onStaleConflict(state, 16);

check.eq("หน้าต่างยังเปิดอยู่", after.open, true);
check.eq("จำนวนที่นับได้ยังอยู่", after.counted, "17");
check.eq("เหตุผลยังอยู่", after.reason, "stock_count");
check.eq("รายละเอียดที่พิมพ์ยังอยู่", after.note, "นับใหม่แล้วขาด 1");
check.eq("จำนวนในระบบอัปเดตเป็นค่าจริงใหม่", after.current, 16);
check.ok("มีข้อความบอกให้ตรวจนับใหม่", after.error?.includes("กรุณาตรวจนับใหม่"));
check.eq(
  "กดบันทึกซ้ำได้เลยโดยไม่ต้องกรอกใหม่ (ผลต่างคิดจากค่าจริงใหม่)",
  Number(after.counted) - after.current,
  1,
);

// --- 2. the component still behaves that way -------------------------------
const submit = dialog.slice(dialog.indexOf("async function handleSubmit"), dialog.indexOf("return ("));
const conflictBranch = submit.slice(submit.indexOf("status === 409"), submit.indexOf("} else {"));

check.ok(
  "จับ 409 แยกจาก error อื่น",
  /submitError\.status === 409/.test(submit),
  "the 409 branch has gone",
);
check.ok("409 แล้วไม่ปิดหน้าต่าง", !/onOpenChange\(false\)/.test(conflictBranch));
for (const [label, setter] of [
  ["จำนวนที่นับได้", "setCounted"],
  ["เหตุผล", "setReason"],
  ["รายละเอียด", "setNote"],
]) {
  check.ok(`409 แล้วไม่ล้าง${label}`, !new RegExp(`${setter}\\(`).test(conflictBranch));
}
check.ok(
  "409 แล้วโหลดจำนวนจริงใหม่มาแสดง",
  /refreshCurrent\(\)/.test(conflictBranch),
  "the fresh read after a conflict has gone",
);
check.ok(
  "refreshCurrent แก้แค่จำนวนในระบบ ไม่แตะช่องที่กรอก",
  (() => {
    const refresh = dialog.slice(dialog.indexOf("async function refreshCurrent"), dialog.indexOf("async function handleSubmit"));
    return /setCurrent\(/.test(refresh) && !/setCounted\(|setReason\(|setNote\(/.test(refresh);
  })(),
);
check.ok(
  "ข้อความ 409 ตรงตามสเปก",
  /จำนวนคงเหลือเปลี่ยนไประหว่างที่เปิดหน้าต่างนี้ กรุณาตรวจนับใหม่/.test(dialog),
);

// --- 3. nothing may remount the dialog on a 409 ----------------------------
// The parents hold the lot they loaded before opening; a 409 updates only the
// dialog's own state, so the lot prop — and therefore the mount — is unchanged.
for (const [where, file] of [
  ["รายละเอียดยา", "app/(app)/stock/[id]/page.tsx"],
  ["ใกล้หมดอายุ", "app/(app)/expiry/page.tsx"],
  ["หมดอายุแล้ว", "app/(app)/reports/expired/page.tsx"],
]) {
  const page = source(file);
  const usage = page.slice(page.indexOf("<AdjustStockDialog"), page.indexOf("<AdjustStockDialog") + 400);
  check.ok(
    `${where}: ไม่ได้ key ด้วยค่าที่เปลี่ยนตอน 409`,
    !/key=\{/.test(usage),
    "a key here would remount the dialog and wipe the typed values on a 409",
  );
}

process.exit(check.done() ? 1 : 0);
