"use client";

import { Pill } from "lucide-react";

import { DataTable, type Column } from "@/components/common/DataTable";
import { ExpiryCell } from "@/components/common/ExpiryCell";
import { MoneyText } from "@/components/common/MoneyText";
import { QtyText } from "@/components/common/QtyText";
import { isLowStock, type StockRow } from "@/lib/api/reports";
import { describeExpiry } from "@/lib/format/expiry";
import { cn } from "@/lib/utils";

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
      // On a phone: the name, what can be sold (right), how many lots, and
      // when the first lot runs out (the pill). Category, value, the exact
      // date and what can no longer be sold are on the drug's own page
      // (summary cards and the lot table).
      phoneRow={{
        icon: () => <Pill className="size-5" />,
        // Some names already carry the strength ("… 500 mg"): not twice.
        title: (row) =>
          row.strength && !row.name.includes(row.strength) ? `${row.name} ${row.strength}` : row.name,
        subtitle: (row) =>
          [`${row.lot_count} ล็อต`, isLowStock(row) ? "⚠️ ต่ำกว่าจุดสั่งซื้อ" : null].filter(Boolean).join(" · "),
        trailing: (row) => (
          <QtyText
            value={row.available_quantity}
            unit={row.unit}
            low={isLowStock(row)}
            className="text-base font-semibold whitespace-nowrap"
          />
        ),
        badge: (row) => {
          if (row.nearest_expiry === null) {
            return <span className="text-sm text-slate-500">ไม่มีล็อตที่ขายได้</span>;
          }
          const expiry = describeExpiry(row.nearest_expiry, row.days_remaining ?? undefined);
          return (
            <span className={cn("expiry-pill", expiry.className)}>
              <span aria-hidden="true">{expiry.icon}</span> {expiry.headline}
            </span>
          );
        },
      }}
    />
  );
}
