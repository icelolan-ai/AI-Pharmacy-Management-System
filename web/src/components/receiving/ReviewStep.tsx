"use client";

import { DataTable, type Column } from "@/components/common/DataTable";
import { ExpiryCell } from "@/components/common/ExpiryCell";
import { MoneyText } from "@/components/common/MoneyText";
import { QtyText } from "@/components/common/QtyText";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { itemDifference, itemProblems, type DraftItem } from "@/components/receiving/PurchaseItemCard";
import { describeExpiry } from "@/lib/format/expiry";
import { isValidMoney, multiplyMoney, sumMoney } from "@/lib/format/money";

/** Step 2: read it once more, then book it in. Nothing here can be edited —
 *  the shop goes back to step 1 to change anything. */
export function ReviewStep({
  items,
  invoiceNo,
  supplierName,
  confirming,
  onBack,
  onConfirm,
}: {
  items: DraftItem[];
  invoiceNo: string;
  supplierName: string | null;
  confirming: boolean;
  onBack: () => void;
  onConfirm: () => void;
}) {
  const blockers = items.flatMap((item) =>
    itemProblems(item).map((problem) => `${item.medicine_name}: ${problem}`),
  );
  if (!invoiceNo.trim()) blockers.push("ยังไม่ได้กรอกเลขที่ใบส่งของ");

  const mismatches = items.filter((item) => itemDifference(item) !== 0);
  const shortDated = items.filter((item) => {
    if (!item.expiry_date || item.expiryBlocking) return false;
    return describeExpiry(item.expiry_date).days <= 179;
  });

  const estimatedTotal = sumMoney(
    items.map((item) =>
      isValidMoney(item.unit_cost) && /^\d+$/.test(item.quantity_actual)
        ? multiplyMoney(item.unit_cost, Number(item.quantity_actual))
        : null,
    ),
  );

  const columns: Column<DraftItem>[] = [
    {
      key: "medicine",
      header: "ยา",
      cell: (item) => (
        <div>
          <p className="font-medium text-slate-900">{item.medicine_name}</p>
          <p className="text-xs text-slate-500">Lot {item.lot_number || "—"}</p>
        </div>
      ),
    },
    {
      key: "expiry",
      header: "หมดอายุ",
      cell: (item) =>
        item.expiry_date ? (
          <ExpiryCell expiryDate={item.expiry_date} />
        ) : (
          <span className="text-sm text-red-600">ยังไม่กรอก</span>
        ),
    },
    {
      key: "invoiced",
      header: "ตามใบส่งของ",
      align: "right",
      cell: (item) => <QtyText value={Number(item.quantity_invoiced || 0)} unit={item.unit} />,
    },
    {
      key: "actual",
      header: "นับได้จริง",
      align: "right",
      cell: (item) => {
        const difference = itemDifference(item);
        return (
          <div className="flex flex-col items-end">
            <QtyText value={Number(item.quantity_actual || 0)} unit={item.unit} />
            {difference !== 0 ? (
              <span className="text-xs font-medium text-amber-700">
                ⚠️ {difference < 0 ? "ขาด" : "เกิน"} {Math.abs(difference)} {item.unit}
              </span>
            ) : null}
          </div>
        );
      },
    },
    {
      key: "cost",
      header: "ต้นทุน/หน่วย",
      align: "right",
      cell: (item) => <MoneyText value={item.unit_cost} />,
    },
  ];

  return (
    <div className="space-y-4">
      <Alert>
        <AlertDescription>
          🔒 ตรวจสอบครั้งสุดท้าย — เมื่อยืนยันแล้วจะแก้ไขใบนี้ไม่ได้ ต้องใช้การปรับ Stock แทน
        </AlertDescription>
      </Alert>

      <div className="rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm">
        <p>
          ผู้จำหน่าย <span className="font-medium">{supplierName ?? "-"}</span>
        </p>
        <p>
          เลขที่ใบส่งของ <span className="font-medium">{invoiceNo || "—"}</span>
        </p>
      </div>

      <DataTable
        columns={columns}
        rows={items}
        rowKey={(item) => item.key}
        caption="รายการที่จะรับเข้าคลัง"
      />

      <div className="flex items-center justify-between rounded-lg border border-slate-200 bg-white px-4 py-3">
        <span className="text-sm text-slate-600">
          รวม {items.length} รายการ · มูลค่าโดยประมาณ
        </span>
        <MoneyText value={estimatedTotal} withUnit className="text-lg font-semibold" />
      </div>

      {(blockers.length > 0 || mismatches.length > 0 || shortDated.length > 0) ? (
        <div className="space-y-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
          <p className="text-sm font-medium text-amber-900">สิ่งที่ต้องตรวจก่อนยืนยัน</p>
          {blockers.map((problem) => (
            <p key={problem} className="text-xs text-red-700">
              ⛔ {problem}
            </p>
          ))}
          {mismatches.map((item) => {
            const difference = itemDifference(item);
            return (
              <p key={`mismatch-${item.key}`} className="text-xs text-amber-800">
                ⚠️ {item.medicine_name} {difference < 0 ? "ขาด" : "เกิน"} {Math.abs(difference)}{" "}
                {item.unit} — ใบรับจะถูกบันทึกเป็น &ldquo;จำนวนไม่ตรง&rdquo;
              </p>
            );
          })}
          {shortDated.map((item) => {
            const expiry = describeExpiry(item.expiry_date!);
            return (
              <p key={`exp-${item.key}`} className="text-xs text-amber-800">
                ⚠️ {item.medicine_name} Lot {item.lot_number} — {expiry.detail} ({expiry.headline})
              </p>
            );
          })}
        </div>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" onClick={onBack} disabled={confirming}>
          ← กลับไปแก้ไข
        </Button>
        <Button type="button" onClick={onConfirm} disabled={confirming || blockers.length > 0}>
          {confirming ? "กำลังยืนยัน..." : "ยืนยันรับเข้าคลัง"}
        </Button>
      </div>
    </div>
  );
}
