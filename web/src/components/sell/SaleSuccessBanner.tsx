"use client";

import { MoneyText } from "@/components/common/MoneyText";
import { Button } from "@/components/ui/button";
import { groupSaleItems, type Sale } from "@/lib/api/sales";
import { formatExpiryBE } from "@/lib/format/date";

/** Shown after a sale goes through: what to pick off the shelf, and the only
 *  way to print. Printing never starts by itself (Q-rule). */
export function SaleSuccessBanner({
  sale,
  printing,
  onPrint,
  canSeePrice,
}: {
  sale: Sale;
  printing: boolean;
  onPrint: () => void;
  canSeePrice: boolean;
}) {
  const lines = groupSaleItems(sale.items);

  return (
    <div className="space-y-3 rounded-lg border border-green-200 bg-green-50 px-4 py-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-medium text-green-800">✅ บันทึกการขายแล้ว</p>
        {canSeePrice ? (
          <MoneyText value={sale.total_amount} withUnit className="font-semibold text-green-900" />
        ) : null}
      </div>

      <p className="text-xs text-green-900">เลขที่บิล {sale.id}</p>

      <div className="space-y-0.5">
        {lines.map((line) =>
          line.lots.map((lot) => (
            <p key={`${line.medicine_id}-${lot.lot_id}`} className="text-sm text-green-900">
              หยิบ {line.medicine_name} {lot.quantity} จาก Lot {lot.lot_number} (EXP{" "}
              {formatExpiryBE(lot.expiry_date)})
            </p>
          )),
        )}
      </div>

      <Button type="button" onClick={onPrint} disabled={printing}>
        {printing ? "กำลังเตรียมพิมพ์..." : "🖨 พิมพ์ใบเสร็จ"}
      </Button>
    </div>
  );
}
