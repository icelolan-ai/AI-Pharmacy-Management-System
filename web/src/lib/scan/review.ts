/** The words of the review page (6.4), in one place and in plain code, so a
 *  check can call them (D43-a) and the page never invents its own wording.
 *
 *  D62: "not on the paper" and "could not be read" are told apart in words.
 *  D57 · D85: a field a person must touch says "ต้องตรวจ" — never colour alone.
 *  D16 · D87: a day the system chose says so.
 */

import type { AiField, DecidedDate, Extracted, TotalCheck } from "@/lib/api/invoice-scans";

/** Chat A 6.4: a scan read by the stand-in says so, in words, at the top. */
export const STAND_IN = "stand-in";
export const STAND_IN_LABEL = "ใบทดสอบ — ข้อมูลนี้ไม่ได้อ่านโดย AI";

export function isStandIn(provider: string | null | undefined): boolean {
  return provider === STAND_IN;
}

export const STATUS_WORDS: Record<string, string> = {
  uploaded: "ยังไม่ได้อ่าน",
  extracting: "กำลังอ่าน",
  needs_review: "รอตรวจ",
  converted: "สร้างใบรับสินค้าแล้ว",
  rejected: "ปฏิเสธแล้ว",
  failed: "อ่านไม่สำเร็จ",
};

export function statusWord(status: string): string {
  return STATUS_WORDS[status] ?? status;
}

/** Statuses a whole scan may be deleted in (backend DELETABLE). */
export const DELETABLE = ["uploaded", "needs_review", "failed"] as const;

export function canDelete(status: string): boolean {
  return (DELETABLE as readonly string[]).includes(status);
}

/** Why a scan cannot be deleted, in the backend's own words. */
export function whyKept(status: string): string | null {
  if (status === "converted") return "ใบนี้สร้างใบรับสินค้าแล้ว ลบไม่ได้ เพราะเป็นหลักฐานของการรับสินค้า";
  if (status === "rejected") return "ใบที่ปฏิเสธแล้วเก็บไว้เป็นหลักฐาน ลบไม่ได้";
  if (status === "extracting") return "กำลังอ่านใบนี้อยู่ รอให้อ่านเสร็จก่อนแล้วค่อยลบ";
  return null;
}

/** What went wrong with a reading, for the person who will press read again. */
export function failedWord(reason: string | null): string {
  const code = (reason ?? "").split(":")[0];
  switch (code) {
    case "ai_unavailable":
      return "ระบบอ่านใบไม่ว่างหรือติดต่อไม่ได้ ลองอ่านใหม่อีกครั้ง";
    case "ai_not_json":
    case "ai_bad_shape":
      return "ระบบอ่านใบตอบกลับมาในรูปแบบที่ใช้ไม่ได้ ลองอ่านใหม่ หรือกรอกเองตามเดิม";
    case "storage_unavailable":
      return "เปิดรูปของใบนี้ไม่ได้ ลองอ่านใหม่อีกครั้ง";
    default:
      return "อ่านใบนี้ไม่สำเร็จ ลองอ่านใหม่อีกครั้ง";
  }
}

export const FIELD_LABELS: Record<string, string> = {
  supplier_name: "ผู้ขาย",
  supplier_tax_id: "เลขผู้เสียภาษี",
  invoice_no: "เลขที่ใบ",
  doc_date: "วันที่ในใบ",
  name: "ชื่อยา",
  quantity: "จำนวน",
  unit: "หน่วย",
  unit_price: "ราคา/หน่วย",
  line_discount: "ส่วนลด",
  amount: "จำนวนเงิน",
  lot: "LOT",
  mfg: "วันผลิต",
  exp: "วันหมดอายุ",
  remark: "หมายเหตุ",
  total_amount: "ยอดเงิน",
};

/** D62: what to say when a field holds no value. */
export function emptyWord(field: AiField | undefined, name: string): string | null {
  if (!field || field.state === "read") return null;
  if (field.state === "unreadable") return "อ่านไม่ออก ดูจากรูป";
  if (name === "lot" || name === "exp" || name === "mfg") return "ไม่มีบนใบส่งของ ดูจากกล่องยา";
  return "ไม่มีบนใบ";
}

export const WHY_WORDS: Record<string, string> = {
  low_confidence: "ระบบไม่แน่ใจ",
  unreadable: "อ่านไม่ออก ดูจากรูป",
  ambiguous_date: "วันที่อ่านได้สองแบบ ต้องเลือก",
  not_money: "ไม่ใช่ตัวเลขเงิน",
  not_a_count: "ไม่ใช่จำนวน",
  not_a_date: "ไม่ใช่วันที่",
  era_unknown: "ไม่รู้ว่าเป็น พ.ศ. หรือ ค.ศ.",
  carried_from_line: "ชื่อสืบมาจากบรรทัดบน ต้องยืนยัน",
  repeat_not_sure: "ไม่แน่ใจว่าสืบชื่อจากบรรทัดไหน ต้องใส่ชื่อเอง",
  repeat_not_verified: "บรรทัดที่สืบชื่อมาไม่มีชื่อ ต้องใส่ชื่อเอง",
  looks_like_repeat_mark: "เป็นเครื่องหมายซ้ำบรรทัด ต้องใส่ชื่อเอง",
  price_unreadable_not_free: "ราคาอ่านไม่ออก จึงยังไม่นับเป็นของแถม",
  unit_written_twice_differently: "หน่วยเขียนไว้สองแบบไม่ตรงกัน",
  exp_not_after_mfg: "วันหมดอายุไม่หลังวันผลิต",
  expired_before_document_date: "หมดอายุก่อนวันที่ในใบ",
};

export function whyWord(why: string): string {
  return WHY_WORDS[why] ?? why;
}

/** D57: the label a field must carry when a person has to touch it. */
export const MUST_CHECK_WORD = "ต้องตรวจ";

export function bahtOf(satang: number | null | undefined): string {
  if (satang === null || satang === undefined) return "-";
  return (satang / 100).toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** D16 · D87: what the page says about a date's day or a suggested date. */
export function dateNote(date: DecidedDate): string | null {
  if (date.day_filled_by_system) return "ระบบเติมวันสุดท้ายของเดือน (ใบเขียนแค่เดือน/ปี)";
  if (date.ambiguous && date.suggested) return "ระบบเลือกไว้ให้: วันที่ใกล้วันถ่ายรูปที่สุดและไม่เลยวันนั้น ต้องกดยืนยัน";
  if (date.ambiguous) return "อ่านได้สองแบบ ต้องเลือกเอง";
  if (date.how.startsWith("inferred_")) return "ลำดับวัน/เดือนดูจากบรรทัดอื่นในใบเดียวกัน";
  return null;
}

const RULE_WORDS: Record<string, string> = {
  lines_add_up_to_gross: "ยอดรวมของทุกบรรทัด กับช่องรวมเงิน",
  gross_minus_discount_is_net: "รวมเงิน ลบ ส่วนลด กับช่องยอดสุทธิ",
  net_over_vat_rate_is_base: "ยอดสุทธิ ÷ 1.07 กับช่องยอดก่อนภาษี",
  base_plus_vat_is_net: "ยอดก่อนภาษี บวก ภาษี กับช่องยอดสุทธิ",
};

/** A failed total check, with both numbers (Chat A: a warning, never a block). */
export function checkWarning(check: TotalCheck): string {
  const subject = check.rule === "line_amount"
    ? `บรรทัด ${check.line_no}: จำนวน × ราคา`
    : RULE_WORDS[check.rule] ?? check.rule;
  return `${subject} ไม่ตรงกัน — คำนวณได้ ${bahtOf(check.expected_satang)} แต่ในใบเขียน ${bahtOf(check.printed_satang)}`;
}

// --- 6.4: touching fields --------------------------------------------------------


export type FieldKind = "text" | "date" | "count" | "money";

/** The input a field takes — the same groups the backend checks. */
export function fieldKind(path: string): FieldKind {
  const name = path.startsWith("totals.") ? "total" : path.split(".").pop() ?? "";
  if (["doc_date", "due_date", "mfg", "exp"].includes(name)) return "date";
  if (name === "quantity") return "count";
  if (["unit_price", "line_discount", "amount", "total"].includes(name)) return "money";
  return "text";
}

const baht2 = (satang: number | null) => (satang === null ? null : `${Math.floor(satang / 100)}.${String(satang % 100).padStart(2, "0")}`);

/** What the page shows for a field, in the form the backend stores — the
 *  same rule as invoice_review.locate on the server. Choosing exactly this
 *  value is "confirmed"; anything else is "changed". */
export function shownFor(extracted: Extracted, path: string): string | null {
  const { ai, derived } = extracted;
  const [head, second, third] = path.split(".");
  if (head === "header") {
    if (second === "doc_date" || second === "due_date") {
      const decided = second === "doc_date" ? derived.doc_date : derived.due_date;
      return decided?.value ?? decided?.suggested ?? null;
    }
    const field = (ai as unknown as Record<string, AiField | undefined>)[second];
    return field?.state === "read" ? field.text : null;
  }
  if (head === "totals") {
    const field = ai.totals.boxes[Number(third)]?.amount;
    if (field?.state !== "read" || !field.text) return null;
    const clean = field.text.replace(/,/g, "");
    return /^\d+(\.\d{1,2})?$/.test(clean) ? Number(clean).toFixed(2) : null;
  }
  const line = derived.lines.find((entry) => entry.line_no === Number(second));
  const aiLine = ai.lines.find((entry) => entry.line_no === Number(second));
  if (!line) return null;
  switch (third) {
    case "name": return line.name;
    case "quantity": return line.quantity === null ? null : String(line.quantity);
    case "unit": return line.unit;
    case "unit_price": return baht2(line.unit_price_satang);
    case "line_discount": return baht2(line.line_discount_satang);
    case "amount": return baht2(line.amount_satang);
    case "lot": return line.lot;
    case "mfg": return line.mfg.value;
    case "exp": return line.exp.value;
    default: {
      const field = aiLine?.[third] as AiField | undefined;
      return field?.state === "read" ? field.text : null;
    }
  }
}

/** Whether "ถูกต้อง" may be pressed: an empty value only for a field that is
 *  not on the paper (backend refuses the rest). */
export function canConfirm(shown: string | null, field: AiField | undefined): boolean {
  return shown !== null || field?.state === "absent";
}

export function untouchedWord(count: number): string {
  return count === 0 ? "ตรวจครบทุกช่องที่ต้องตรวจแล้ว" : `ยังต้องตรวจอีก ${count} ช่อง`;
}
