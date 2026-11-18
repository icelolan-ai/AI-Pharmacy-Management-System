import { ABILITIES, can } from "@/lib/abilities";

/** The home page's summary cards (D82): numbers the existing endpoints
 *  already give, and only to whoever may see them. No new endpoint.
 *
 *  - ล็อตที่ต้องดูภายใน 90 วัน — GET /reports/expiring, viewReports
 *    (owner, pharmacist). Its summary already counts lots by level.
 *  - ใบส่งของที่ถ่ายไว้ ยังไม่ได้รับเข้า — GET /invoice-scans, receiveStock
 *    (owner, pharmacist). A scan with no page yet is not counted.
 *
 *  Stock value is not here: it is the owner's alone (D20), and a summary
 *  that shows it to some and hides it from others is easy to get wrong in
 *  the one place everybody looks. Sales today needs an endpoint that does
 *  not exist yet — proposed, not added (rule 60).
 *
 *  A cashier sees no card at all: neither number is theirs. */
export type SummaryCards = { expiring: boolean; scans: boolean };

export function summaryCardsFor(role: string | null | undefined): SummaryCards {
  return {
    expiring: can(role, ABILITIES.viewReports),
    scans: can(role, ABILITIES.receiveStock),
  };
}

export type LevelCount = { lot_count?: number } | undefined;

/** Lots in the two worst levels: วิกฤต (≤ 30 days) and เสี่ยงสูง (31–90). */
export function lotsWithin90Days(summary: { critical?: LevelCount; high_risk?: LevelCount }): number {
  return (summary.critical?.lot_count ?? 0) + (summary.high_risk?.lot_count ?? 0);
}

/** Read or being read, but not yet a delivery — and with a page in it. */
export const OPEN_SCAN_STATUSES = ["uploaded", "extracting", "needs_review"] as const;

export function openScanCount(scans: readonly { status: string; page_count: number }[]): number {
  return scans.filter(
    (scan) => (OPEN_SCAN_STATUSES as readonly string[]).includes(scan.status) && scan.page_count > 0,
  ).length;
}

/** "สวัสดี คุณอร" — the first word of the name; "สวัสดี" with none. */
export function greeting(fullName: string | null | undefined): string {
  const first = fullName?.trim().split(/\s+/)[0];
  return first ? `สวัสดี คุณ${first}` : "สวัสดี";
}
