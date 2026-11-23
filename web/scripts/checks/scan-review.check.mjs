/** The review page's words and rules (6.4), from the real module (D43-a).
 *
 *  D62: not on the paper and could not be read are told apart, and LOT/EXP
 *  missing from the paper send a person to the box. D57: a field to touch
 *  says "ต้องตรวจ" in words. Deleting follows the backend's own list, and
 *  the page never offers it for a scan the backend keeps as evidence.
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { createChecker, source } from "./lib.mjs";
import { loadTs } from "./load-ts.mjs";

const check = createChecker("6.4 — หน้าตรวจใบส่งของ");
const review = await loadTs("lib/scan/review");

const read = (text) => ({ state: "read", text, confidence: 0.99 });
const absent = { state: "absent", text: null, confidence: null };
const unreadable = { state: "unreadable", text: null, confidence: 0.2 };

// --- D62 ---------------------------------------------------------------------
check.eq("LOT ไม่มีบนใบ → ดูจากกล่องยา", review.emptyWord(absent, "lot"), "ไม่มีบนใบส่งของ ดูจากกล่องยา");
check.eq("EXP ไม่มีบนใบ → ดูจากกล่องยา", review.emptyWord(absent, "exp"), "ไม่มีบนใบส่งของ ดูจากกล่องยา");
check.eq("อ่านไม่ออก → ดูจากรูป", review.emptyWord(unreadable, "lot"), "อ่านไม่ออก ดูจากรูป");
check.ok("🔴 ไม่มีบนใบ กับ อ่านไม่ออก เป็นคนละคำเสมอ",
  ["lot", "exp", "name", "quantity", "unit_price"].every((f) => review.emptyWord(absent, f) !== review.emptyWord(unreadable, f)));
check.eq("ช่องที่อ่านได้ไม่มีคำบอกเพิ่ม", review.emptyWord(read("FK1"), "lot"), null);

// --- D57 · D85: in words, never colour alone ---------------------------------
check.eq("ช่องที่ต้องแตะบอกด้วยคำ", review.MUST_CHECK_WORD, "ต้องตรวจ");
const page = source("app/(app)/scan/[id]/page.tsx");
check.ok("หน้าตรวจแสดงคำ ต้องตรวจ จากตัวแปรเดียว", /\{MUST_CHECK_WORD\}/.test(page));
for (const why of ["low_confidence", "unreadable", "ambiguous_date", "carried_from_line", "looks_like_repeat_mark",
  "repeat_not_sure", "not_money", "not_a_count", "not_a_date", "era_unknown", "price_unreadable_not_free"]) {
  check.ok(`มีคำอธิบายภาษาไทยของ ${why}`, review.whyWord(why) !== why && /[ก-๙]/.test(review.whyWord(why)));
}

// --- dates (D16 · D87) -----------------------------------------------------------
const date = (extra) => ({ text: "x", state: "read", value: null, ambiguous: false, candidates: [], how: "unambiguous",
  day_filled_by_system: false, ...extra });
check.eq("EXP ที่ระบบเติมวัน บอกว่าระบบเติม", review.dateNote(date({ day_filled_by_system: true, value: "2028-02-29" })),
  "ระบบเติมวันสุดท้ายของเดือน (ใบเขียนแค่เดือน/ปี)");
check.ok("วันที่หัวใบที่ระบบเลือกไว้ให้ บอกว่าต้องกดยืนยัน",
  /ต้องกดยืนยัน/.test(review.dateNote(date({ ambiguous: true, suggested: "2026-09-04", candidates: ["2026-09-04"] }))));
check.ok("วันที่กำกวมที่ไม่มีตัวเลือกให้ บอกว่าต้องเลือกเอง",
  /ต้องเลือกเอง/.test(review.dateNote(date({ ambiguous: true, candidates: ["2026-09-04", "2026-04-09"] }))));

// --- the total checks warn with both numbers --------------------------------------
const warning = review.checkWarning({ rule: "lines_add_up_to_gross", ok: false, expected_satang: 103600, printed_satang: 103700 });
check.ok("คำเตือนยอดไม่ตรง มีทั้งตัวเลขที่คำนวณได้และที่ในใบเขียน", /1,036\.00/.test(warning) && /1,037\.00/.test(warning));
check.ok("คำเตือนยอดบรรทัด บอกเลขบรรทัด",
  /บรรทัด 3/.test(review.checkWarning({ rule: "line_amount", ok: false, expected_satang: 1, printed_satang: 2, line_no: 3 })));

// --- statuses and deleting ------------------------------------------------------------
for (const status of ["uploaded", "extracting", "needs_review", "converted", "rejected", "failed"]) {
  check.ok(`สถานะ ${status} เป็นคำภาษาไทย`, /[ก-๙]/.test(review.statusWord(status)));
}
const here = dirname(fileURLToPath(import.meta.url));
const backend = readFileSync(join(here, "..", "..", "..", "backend", "app", "services", "invoice_scans.py"), "utf8");
const backendList = /DELETABLE = \(([^)]*)\)/.exec(backend)?.[1].match(/"(\w+)"/g).map((s) => s.slice(1, -1));
check.eq("ลบได้เฉพาะสถานะเดียวกับที่ backend อนุญาต", [...review.DELETABLE].sort(), [...(backendList ?? [])].sort());
for (const status of ["converted", "rejected", "extracting"]) {
  check.ok(`🔴 ${status}: ไม่มีปุ่มลบ และบอกเหตุผลเป็นภาษาไทย`, !review.canDelete(status) && /[ก-๙]/.test(review.whyKept(status)));
}
check.ok("ถามยืนยันก่อนลบ และบอกว่ากู้คืนไม่ได้", /ลบแล้วกู้คืนไม่ได้/.test(page) && /setConfirmDelete\(true\)/.test(page));
check.ok("ปุ่มลองอ่านใหม่ เมื่ออ่านไม่สำเร็จ", /"ลองอ่านใหม่"/.test(page));

// --- 6.4: touching fields ------------------------------------------------------------
const reviewPy = readFileSync(join(here, "..", "..", "..", "backend", "app", "services", "invoice_review.py"), "utf8");
const pySet = (name) => /\{([^}]*)\}/.exec(new RegExp(`${name} = \{[^}]*\}`).exec(reviewPy)?.[0] ?? "")?.[1]
  .match(/"(\w+)"/g).map((s) => s.slice(1, -1)).sort();
const kinds = (kind) => ["doc_date", "due_date", "mfg", "exp", "quantity", "unit_price", "line_discount", "amount", "total"]
  .filter((name) => review.fieldKind(name === "total" ? "totals.boxes.0" : `lines.1.${name}`) === kind).sort();
check.eq("ช่องวันที่ตรงกับ backend", kinds("date"), pySet("DATE_FIELDS"));
check.eq("ช่องเงินตรงกับ backend", kinds("money"), pySet("MONEY_FIELDS"));
check.eq("ช่องจำนวนตรงกับ backend", kinds("count"), pySet("COUNT_FIELDS"));
check.eq("ชื่อยาเป็นข้อความ", review.fieldKind("lines.3.name"), "text");

check.ok("ยืนยันว่าไม่มีได้ เฉพาะช่องที่ไม่มีบนใบ (D62)", review.canConfirm(null, absent) && !review.canConfirm(null, unreadable)
  && !review.canConfirm(null, read("05.06.28")) && review.canConfirm("2028-06-05", read("05.06.28")));
check.eq("บอกจำนวนช่องที่ยังต้องตรวจเป็นคำ", review.untouchedWord(3), "ยังต้องตรวจอีก 3 ช่อง");

const extracted = {
  ai: { supplier_name: read("ปลอม"), doc_date: read("04/09/2569"), lines: [{ line_no: 1, remark: read("แถม") }],
        totals: { boxes: [{ label: "รวมเงิน", amount: read("1,036.00") }] } },
  derived: {
    doc_date: date({ ambiguous: true, candidates: ["2026-09-04", "2026-04-09"], suggested: "2026-09-04" }),
    lines: [{ line_no: 1, name: "ยา", quantity: 10, unit: "กล่อง", unit_price_satang: 3500, line_discount_satang: null,
              amount_satang: 35005, lot: "FK1", mfg: date({ value: "2024-01-15" }), exp: date({ value: null }) }],
  },
};
check.eq("ค่าที่แสดง: วันที่ที่ระบบเลือกไว้ให้", review.shownFor(extracted, "header.doc_date"), "2026-09-04");
check.eq("ค่าที่แสดง: เงินเป็นรูปเดียวกับ backend", review.shownFor(extracted, "lines.1.amount"), "350.05");
check.eq("ค่าที่แสดง: จำนวน", review.shownFor(extracted, "lines.1.quantity"), "10");
check.eq("ค่าที่แสดง: ยอดท้ายใบ ตัดจุลภาค", review.shownFor(extracted, "totals.boxes.0"), "1036.00");
check.eq("ค่าที่แสดง: ไม่มีส่วนลด", review.shownFor(extracted, "lines.1.line_discount"), null);

check.ok("ปุ่มไปต่อปิดเมื่อยังมีช่องที่ต้องตรวจ", /disabled=\{busy \|\| review\.untouched\.size > 0\}/.test(page));
check.ok("ปฏิเสธต้องกรอกเหตุผลก่อน", /disabled=\{busy \|\| !reason\.trim\(\)\}/.test(page));

// --- the stand-in says so (Chat A, after 6.4) -----------------------------------------
const standIn = readFileSync(join(here, "..", "..", "..", "backend", "app", "ai", "stand_in.py"), "utf8");
check.eq("ป้ายใบทดสอบใช้ถ้อยคำที่ Chat A กำหนด", review.STAND_IN_LABEL, "ใบทดสอบ — ข้อมูลนี้ไม่ได้อ่านโดย AI");
check.ok("ชื่อผู้อ่านของตัวแทนตรงกับ backend", new RegExp(`PROVIDER_NAME = "${review.STAND_IN}"`).test(standIn));
check.ok("ป้ายของ backend กับหน้าเว็บเป็นคำเดียวกัน", standIn.includes(`TEST_LABEL = "${review.STAND_IN_LABEL}"`));
check.ok("ใบที่อ่านโดยตัวแทน รู้ได้ · ใบที่ AI อ่าน ไม่ขึ้นป้าย", review.isStandIn("stand-in") && !review.isStandIn("gemini"));
check.ok("หน้าตรวจขึ้นป้ายเมื่อเป็นตัวแทน", /isStandIn\(detail\.provider\)[\s\S]{0,300}\{STAND_IN_LABEL\}/.test(page));

process.exit(check.done() ? 1 : 0);
