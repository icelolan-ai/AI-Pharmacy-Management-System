"use client";

import { DataTable, type Column } from "@/components/common/DataTable";
import { ExpiryCell } from "@/components/common/ExpiryCell";
import { MoneyText } from "@/components/common/MoneyText";
import { QtyText } from "@/components/common/QtyText";
import { Button } from "@/components/ui/button";
import type { Lot } from "@/lib/api/lots";
import { formatDateBE } from "@/lib/format/date";

/** A lot counts towards sellable stock only while the backend says so (D10). */
export function isSellableLot(lot: Lot): boolean {
  return lot.sellable && lot.quantity_remaining > 0;
}

/** FEFO first, then everything that cannot be sold, in expiry order.
 *  The sellable ones carry the 1/2/3 the staff picks from. */
export function orderLotsForDisplay(lots: Lot[]): { lot: Lot; fefoRank: number | null }[] {
  const byExpiry = (a: Lot, b: Lot) =>
    a.expiry_date.localeCompare(b.expiry_date) ||
    a.received_date.localeCompare(b.received_date) ||
    a.id.localeCompare(b.id);

  const sellable = lots.filter(isSellableLot).sort(byExpiry);
  const rest = lots.filter((lot) => !isSellableLot(lot)).sort(byExpiry);

  return [
    ...sellable.map((lot, index) => ({ lot, fefoRank: index + 1 })),
    ...rest.map((lot) => ({ lot, fefoRank: null })),
  ];
}

type Row = { lot: Lot; fefoRank: number | null };

export function LotTable({
  lots,
  unit,
  canSeeCost,
  canAdjust,
  adjustBusy = false,
  onAdjust,
}: {
  lots: Lot[];
  unit: string;
  canSeeCost: boolean;
  canAdjust: boolean;
  adjustBusy?: boolean;
  onAdjust: (lot: Lot) => void;
}) {
  const rows = orderLotsForDisplay(lots);

  const columns: Column<Row>[] = [
    {
      key: "lot",
      header: "ล็อต",
      cell: ({ lot, fefoRank }) => (
        <div>
          <p className="font-medium text-slate-900">
            {fefoRank !== null ? (
              <span
                className="mr-1.5 inline-flex size-5 items-center justify-center rounded-full bg-slate-900 text-xs text-white"
                title="ลำดับการตัดจ่ายแบบ FEFO"
              >
                {fefoRank}
              </span>
            ) : (
              <span className="mr-1.5" aria-hidden="true">
                ⛔
              </span>
            )}
            <span className={isSellableLot(lot) ? undefined : "line-through decoration-slate-400"}>
              {lot.lot_number}
            </span>
          </p>
          <p className="text-xs text-slate-500">รับเข้า {formatDateBE(lot.received_date)}</p>
        </div>
      ),
    },
    {
      key: "quantity",
      header: "คงเหลือ",
      align: "right",
      cell: ({ lot }) => <QtyText value={lot.quantity_remaining} unit={unit} />,
    },
    {
      key: "expiry",
      header: "หมดอายุ",
      cell: ({ lot }) => (
        <div>
          <ExpiryCell expiryDate={lot.expiry_date} apiDaysRemaining={lot.days_remaining} />
          {!isSellableLot(lot) ? (
            <p className="mt-0.5 text-xs text-slate-500">ไม่นับรวมในจำนวนที่ขายได้</p>
          ) : null}
        </div>
      ),
    },
  ];

  if (canSeeCost) {
    columns.push({
      key: "cost",
      header: "ต้นทุน/หน่วย",
      align: "right",
      cell: ({ lot }) => <MoneyText value={lot.cost_per_unit} />,
    });
  }

  if (canAdjust) {
    columns.push({
      key: "actions",
      header: "",
      align: "right",
      // Lots that can no longer be sold still need adjusting (write-off).
      cell: ({ lot }) => (
        <Button
          variant="outline"
          size="sm"
          disabled={adjustBusy}
          onClick={(event) => {
            event.stopPropagation();
            onAdjust(lot);
          }}
        >
          ปรับ
        </Button>
      ),
    });
  }

  return (
    <DataTable
      columns={columns}
      rows={rows}
      rowKey={({ lot }) => lot.id}
      rowClassName={({ lot }) =>
        isSellableLot(lot) ? undefined : "bg-slate-50 text-slate-500"
      }
      caption="ล็อตของยานี้"
    />
  );
}
