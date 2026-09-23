"use client";

import { DataTable, type Column } from "@/components/common/DataTable";
import { ExpiryCell } from "@/components/common/ExpiryCell";
import { MoneyText } from "@/components/common/MoneyText";
import { QtyText } from "@/components/common/QtyText";
import { Button } from "@/components/ui/button";
import type { ExpiringRow } from "@/lib/api/reports";

/** Lots that can still be sold but expire soon. Sorted by the API, nearest first.
 *  The expiry column goes through ExpiryCell, so the number on screen is the
 *  API's days_remaining minus one (D19). */
export function ExpiringTable({
  rows,
  canAdjust,
  adjustBusy,
  onAdjust,
}: {
  rows: ExpiringRow[];
  canAdjust: boolean;
  adjustBusy: boolean;
  onAdjust: (row: ExpiringRow) => void;
}) {
  const columns: Column<ExpiringRow>[] = [
    {
      key: "medicine",
      header: "ยา",
      cell: (row) => <span className="font-medium text-slate-900">{row.medicine_name}</span>,
    },
    { key: "lot", header: "ล็อต", cell: (row) => row.lot_number },
    {
      key: "expiry",
      header: "หมดอายุ / ขายได้ถึง",
      cell: (row) => (
        <ExpiryCell expiryDate={row.expiry_date} apiDaysRemaining={row.days_remaining} />
      ),
    },
    {
      key: "quantity",
      header: "จำนวน",
      align: "right",
      cell: (row) => <QtyText value={row.quantity_remaining} unit={row.unit} />,
    },
  ];

  columns.push({
    key: "value",
    header: "มูลค่า",
    align: "right",
    cell: (row) => <MoneyText value={row.stock_value} />,
  });

  if (canAdjust) {
    columns.push({
      key: "actions",
      header: "",
      align: "right",
      cell: (row) => (
        <Button
          variant="outline"
          size="sm"
          disabled={adjustBusy}
          onClick={(event) => {
            event.stopPropagation();
            onAdjust(row);
          }}
        >
          ปรับ Stock
        </Button>
      ),
    });
  }

  return (
    <DataTable
      columns={columns}
      rows={rows}
      rowKey={(row) => row.lot_id}
      caption="ล็อตที่ใกล้หมดอายุ"
    />
  );
}
