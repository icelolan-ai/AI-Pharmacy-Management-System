import { MoneyText } from "@/components/common/MoneyText";
import { Card, CardContent } from "@/components/ui/card";
import { RISK_LABEL, RISK_ORDER, type ExpiringReport } from "@/lib/api/reports";
import { RISK_META } from "@/lib/format/expiry";

/** The four risk boxes. Every box shows BOTH the number of lots and the money,
 *  so a shop never sees a count without knowing what it is worth. */
export function RiskSummaryCards({ summary }: { summary: ExpiringReport["summary"] }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {RISK_ORDER.map((risk) => {
        const entry = summary[risk] ?? { lot_count: 0 };
        const meta = RISK_META[risk];
        return (
          <Card key={risk}>
            <CardContent className="pt-6">
              <p className={`text-sm font-medium ${meta.className}`}>
                <span aria-hidden="true">{meta.icon}</span> {RISK_LABEL[risk]}
              </p>
              <p className="mt-2 text-2xl font-semibold tabular-nums text-slate-900">
                {entry.lot_count}
                <span className="ml-1 text-sm font-normal text-slate-500">ล็อต</span>
              </p>
              <p className="mt-1 text-sm text-slate-600">
                <MoneyText value={entry.stock_value} withUnit />
              </p>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
