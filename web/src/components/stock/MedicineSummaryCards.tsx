import { MoneyText } from "@/components/common/MoneyText";
import { QtyText } from "@/components/common/QtyText";
import { Card, CardContent } from "@/components/ui/card";
import type { Lot } from "@/lib/api/lots";
import { isSellableLot } from "@/components/stock/LotTable";

function sum(lots: Lot[], keep: (lot: Lot) => boolean): number {
  return lots.reduce((total, lot) => (keep(lot) ? total + lot.quantity_remaining : total), 0);
}

/** The three numbers at the top of a medicine page.
 *  The value card is not rendered at all for staff. */
export function MedicineSummaryCards({
  lots,
  unit,
  canSeeValue,
  stockValue,
}: {
  lots: Lot[];
  unit: string;
  canSeeValue: boolean;
  stockValue?: string;
}) {
  const sellable = sum(lots, isSellableLot);
  const unsellable = sum(lots, (lot) => !isSellableLot(lot));
  const sellableLotCount = lots.filter(isSellableLot).length;

  return (
    <div className="grid gap-3 sm:grid-cols-3">
      <Card>
        <CardContent className="pt-6">
          <p className="text-sm text-slate-600">ขายได้</p>
          <p className="mt-1 text-2xl font-semibold text-slate-900">
            <QtyText value={sellable} unit={unit} />
          </p>
          {unsellable > 0 ? (
            <p className="mt-1 text-xs text-slate-500">
              (ไม่รวม {unsellable} {unit} ที่ขายไม่ได้แล้ว)
            </p>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-6">
          <p className="text-sm text-slate-600">จำนวนล็อต</p>
          <p className="mt-1 text-2xl font-semibold text-slate-900">
            <QtyText value={sellableLotCount} unit="ล็อต" />
          </p>
          {lots.length > sellableLotCount ? (
            <p className="mt-1 text-xs text-slate-500">
              ทั้งหมด {lots.length} ล็อต (รวมที่ขายไม่ได้แล้ว)
            </p>
          ) : null}
        </CardContent>
      </Card>

      {canSeeValue ? (
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-slate-600">มูลค่าที่ขายได้</p>
            <p className="mt-1 text-2xl font-semibold text-slate-900">
              <MoneyText value={stockValue} withUnit />
            </p>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
