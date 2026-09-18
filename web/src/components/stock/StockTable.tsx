"use client";

import { DataTable, type Column } from "@/components/common/DataTable";
import { ExpiryCell } from "@/components/common/ExpiryCell";
import { MoneyText } from "@/components/common/MoneyText";
import { QtyText } from "@/components/common/QtyText";
import { isLowStock, type StockRow } from "@/lib/api/reports";

/** The stock list. Every quantity carries the medicine's own unit, and the
 *  value column is dropped entirely — header included — for staff. */
export function StockTable({
  rows,
  canSeeValue,
  onRowClick,
}: {
  rows: StockRow[];
  canSeeValue: boolean;
  onRowClick: (row: StockRow) => void;
}) {
  const columns: Column<StockRow>[] = [
    {
      key: "name",
      header: "ชื่อยา",
      cell: (row) => (
        <div>
          <p className="font-medium text-slate-900">{row.name}</p>
          <p className="text-xs text-slate-500">
            {[row.strength, row.category].filter(Boolean).join(" · ") || "-"}
          </p>
        </div>
      ),
    },
    {
      key: "available",
      header: "คงเหลือที่ขายได้",
      align: "right",
      cell: (row) => (
        <div className="flex flex-col items-end">
          <QtyText value={row.available_quantity} unit={row.unit} low={isLowStock(row)} />
          {isLowStock(row) ? (
            <span className="mt-0.5 text-xs font-medium text-amber-700">
              ⚠️ ต่ำกว่าจุดสั่งซื้อ
            </span>
          ) : null}
          {row.expired_quantity > 0 ? (
            <span className="mt-0.5 text-xs text-slate-500">
              ขายไม่ได้แล้ว {row.expired_quantity} {row.unit}
            </span>
          ) : null}
        </div>
      ),
    },
    {
      key: "lots",
      header: "ล็อต",
      align: "right",
      cell: (row) => <QtyText value={row.lot_count} unit="ล็อต" />,
    },
    {
      key: "nearest",
      header: "ล็อตที่หมดอายุก่อน",
      cell: (row) =>
        row.nearest_expiry === null ? (
          <span className="text-sm text-slate-400">ไม่มีล็อตที่ขายได้</span>
        ) : (
          <ExpiryCell
            expiryDate={row.nearest_expiry}
            apiDaysRemaining={row.days_remaining ?? undefined}
          />
        ),
    },
  ];

  if (canSeeValue) {
    columns.push({
      key: "value",
      header: "มูลค่า",
      align: "right",
      cell: (row) => <MoneyText value={row.available_value} />,
    });
  }

  return (
    <DataTable
      columns={columns}
      rows={rows}
      rowKey={(row) => row.medicine_id}
      onRowClick={onRowClick}
      caption="รายการสต็อกยา"
    />
  );
}
