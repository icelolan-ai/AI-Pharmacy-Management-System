/** Dialogs must open with a clean form.
 *
 *  That used to be done by resetting state in an effect when `open` flipped
 *  true. It is now done by mounting the dialog only while it is open, so the
 *  initial state IS the reset. Both halves have to hold: a dialog that
 *  initialises from props but stays mounted would show the previous entry's
 *  values, and one that is mounted conditionally but resets in an effect puts
 *  the warning back.
 */

import { createChecker, source } from "./lib.mjs";

const check = createChecker("Dialogs open clean");

const dialogs = [
  {
    label: "ยา",
    file: "components/medicines/MedicineFormDialog.tsx",
    init: /useState<FormState>\(\(\) =>\s*medicine \? fromMedicine\(medicine\) : EMPTY,?\s*\)/,
    callers: [
      ["คลังยา", "app/(app)/stock/page.tsx", /\{canManage && dialogOpen \? \(\s*<MedicineFormDialog/],
      ["รายละเอียดยา", "app/(app)/stock/[id]/page.tsx", /\{canManage && medicine && editOpen \? \(\s*<MedicineFormDialog/],
    ],
  },
  {
    label: "ผู้จำหน่าย",
    file: "components/suppliers/SupplierFormDialog.tsx",
    init: /useState<FormState>\(\(\) =>\s*supplier \? fromSupplier\(supplier\) : EMPTY,?\s*\)/,
    callers: [
      ["รายชื่อผู้จำหน่าย", "app/(app)/suppliers/page.tsx", /\{dialogOpen \? \(\s*<SupplierFormDialog/],
      ["รายละเอียดผู้จำหน่าย", "app/(app)/suppliers/[id]/page.tsx", /\{supplier && dialogOpen \? \(\s*<SupplierFormDialog/],
    ],
  },
];

for (const dialog of dialogs) {
  const text = source(dialog.file);
  check.ok(`${dialog.label}: ฟอร์มตั้งค่าเริ่มต้นจาก props ตอน mount`, dialog.init.test(text));
  check.ok(
    `${dialog.label}: ไม่ reset ฟอร์มใน effect อีกแล้ว`,
    !/useEffect\(\(\) => \{\s*if \(open\)/.test(text),
    "the open-triggered reset effect is back",
  );
  for (const [where, file, pattern] of dialog.callers) {
    check.ok(`${dialog.label}: ${where} mount เฉพาะตอนเปิด`, pattern.test(source(file)), file);
  }
}

// --- the shop profile form follows what was last saved ---------------------
const storeForm = source("components/store/StoreProfileForm.tsx");
const storePage = source("app/(app)/settings/store/page.tsx");
check.ok(
  "ฟอร์มข้อมูลร้าน: ตั้งค่าเริ่มต้นจาก profile ตอน mount",
  /useState<FormState>\(\(\) => fromProfile\(profile\)\)/.test(storeForm),
);
check.ok(
  "ฟอร์มข้อมูลร้าน: ไม่ setForm ใน effect อีกแล้ว",
  !/useEffect\(\(\) => \{\s*setForm\(fromProfile/.test(storeForm),
  "the profile-following reset effect is back",
);
check.ok(
  "ฟอร์มข้อมูลร้าน: หน้า key ด้วย profile ที่บันทึกล่าสุด",
  /key=\{store\?\.updated_at \?\? "new"\}/.test(storePage),
  "without the key the form would not pick up a freshly saved profile",
);

// --- the search box no longer writes a ref while rendering -----------------
const search = source("components/common/MedicineSearchInput.tsx");
check.ok(
  "ช่องค้นหา: เขียน ref ใน effect ไม่ใช่ตอน render",
  /useEffect\(\(\) => \{\s*callbackRef\.current = onDebouncedChange;\s*\}\);/.test(search),
);
check.ok(
  "ช่องค้นหา: debounce ยังเป็น 300 ms",
  /DEBOUNCE_MS = 300/.test(search),
);

process.exit(check.done() ? 1 : 0);
