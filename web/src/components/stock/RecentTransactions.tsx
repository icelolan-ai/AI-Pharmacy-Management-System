"use client";

import { DataTable, type Column } from "@/components/common/DataTable";
import { EmptyState } from "@/components/common/EmptyState";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { InventoryTransaction, TransactionType } from "@/lib/api/lots";
import { formatDateTimeBE } from "@/lib/format/date";

const TYPE_LABEL: Record<TransactionType, string> = {
  purchase: "รับเข้า",
  sale: "ขาย",
  adjustment: "ปรับจำนวน",
  damage: "ชำรุด",
  expired: "หมดอายุ",
  return: "คืนผู้จำหน่าย",
  correction: "แก้ไขจากการนับ",
};

/** Movement history of one lot. Managers only — staff never reaches this. */
export function RecentTransactions({
  lotNumber,
  transactions,
  unit,
}: {
  lotNumber: string | null;
  transactions: InventoryTransaction[];
  unit: string;
}) {
  const columns: Column<InventoryTransaction>[] = [
    {
      key: "when",
      header: "เมื่อไร",
      cell: (row) => (
        <span className="text-sm text-slate-600">{formatDateTimeBE(row.created_at)}</span>
      ),
    },
    {
      key: "type",
      header: "รายการ",
      cell: (row) => (
        <div>
          <p className="text-sm text-slate-900">{TYPE_LABEL[row.transaction_type]}</p>
          {row.notes ? <p className="text-xs text-slate-500">{row.notes}</p> : null}
        </div>
      ),
    },
    {
      key: "change",
      header: "เปลี่ยนแปลง",
      align: "right",
      cell: (row) => (
        <span
          className={`tabular-nums text-sm font-medium ${
            row.quantity_change < 0 ? "text-red-600" : "text-green-700"
          }`}
        >
          {row.quantity_change > 0 ? "+" : "−"}
          {Math.abs(row.quantity_change)} {unit}
        </span>
      ),
    },
    {
      key: "after",
      header: "คงเหลือหลังรายการ",
      align: "right",
      cell: (row) => (
        <span className="tabular-nums text-sm text-slate-600">
          {row.quantity_before} → {row.quantity_after} {unit}
        </span>
      ),
    },
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">
          ประวัติการเคลื่อนไหว{lotNumber ? ` — ล็อต ${lotNumber}` : ""}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {transactions.length === 0 ? (
          <EmptyState title="ยังไม่มีการเคลื่อนไหวของล็อตนี้" />
        ) : (
          <DataTable
            columns={columns}
            rows={transactions}
            rowKey={(row) => row.id}
            caption="ประวัติการเคลื่อนไหวของล็อต"
          />
        )}
      </CardContent>
    </Card>
  );
}
