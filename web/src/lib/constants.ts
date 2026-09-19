import type { AuditLog } from "@/lib/api/audit";

/** Nothing on screen says "medicines" or "UPDATE" — every table and action is
 *  named in Thai (spec 5.7). */
export const TABLE_LABEL_TH: Record<string, string> = {
  medicines: "ข้อมูลยา",
  medicine_lots: "ล็อตยา",
  purchases: "ใบรับสินค้า",
  purchase_items: "รายการในใบรับสินค้า",
  sales: "การขาย",
  sale_items: "รายการขาย",
  inventory_transactions: "การเคลื่อนไหวสต็อก",
  suppliers: "ผู้จำหน่าย",
  store_profile: "ข้อมูลร้าน",
  user_profiles: "ผู้ใช้งาน",
};

/** The API writes these lowercase; compare case-insensitively. */
export const ACTION_LABEL_TH: Record<string, string> = {
  insert: "เพิ่ม",
  update: "แก้ไข",
  delete: "ลบ",
};

export function tableLabel(tableName: string): string {
  return TABLE_LABEL_TH[tableName] ?? tableName;
}

export function actionLabel(action: string): string {
  return ACTION_LABEL_TH[action?.toLowerCase()] ?? action;
}

function readString(value: Record<string, unknown> | null, key: string): string | null {
  const found = value?.[key];
  return typeof found === "string" && found.trim() !== "" ? found : null;
}

/** The most useful name for whatever was changed, read out of the audited
 *  values themselves — there is no entity_label field (B-10). Falls back to a
 *  short id rather than showing a full UUID. */
export function entityLabelFrom(log: AuditLog): string {
  const keysByTable: Record<string, string[]> = {
    medicines: ["name"],
    medicine_lots: ["lot_number"],
    purchases: ["purchase_no", "invoice_no"],
    sales: ["sale_no"],
    suppliers: ["name"],
    store_profile: ["name"],
    user_profiles: ["full_name"],
  };

  for (const key of keysByTable[log.table_name] ?? ["name"]) {
    const label = readString(log.new_value, key) ?? readString(log.old_value, key);
    if (label) return label;
  }
  return `(${log.record_id.slice(0, 8)})`;
}

/** Only the fields that actually changed, old next to new. */
export function changedFields(log: AuditLog): { field: string; before: unknown; after: unknown }[] {
  const before = log.old_value ?? {};
  const after = log.new_value ?? {};
  const keys = [...new Set([...Object.keys(before), ...Object.keys(after)])];
  return keys
    .filter((key) => JSON.stringify(before[key]) !== JSON.stringify(after[key]))
    .map((key) => ({ field: key, before: before[key], after: after[key] }));
}

/** Audited values can be objects or arrays; keep them readable in a table. */
export function formatAuditValue(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "string") return value === "" ? "—" : value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) return `${value.length} รายการ`;
  return "(ข้อมูลหลายช่อง)";
}
