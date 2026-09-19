"use client";

import { MoneyText } from "@/components/common/MoneyText";
import { MonthYearInput, type MonthYearState } from "@/components/common/MonthYearInput";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { isValidMoney, multiplyMoney } from "@/lib/format/money";

/** One line being received. Quantities are kept as text while typing so a
 *  half-typed number never becomes 0 behind the shop's back. */
export type DraftItem = {
  key: string;
  medicine_id: string;
  medicine_name: string;
  unit: string;
  lot_number: string;
  expiry_date: string | null;
  expiryBlocking: boolean;
  quantity_invoiced: string;
  quantity_actual: string;
  unit_cost: string;
};

export function itemDifference(item: DraftItem): number {
  const invoiced = Number(item.quantity_invoiced || 0);
  const actual = Number(item.quantity_actual || 0);
  return actual - invoiced;
}

/** Everything a line needs before the goods may be booked in. */
export function itemProblems(item: DraftItem): string[] {
  const problems: string[] = [];
  if (!item.lot_number.trim()) problems.push("ยังไม่ได้กรอกเลขล็อต");
  if (!item.expiry_date) problems.push("ยังไม่ได้กรอกวันหมดอายุ");
  if (item.expiryBlocking) problems.push("วันหมดอายุนี้ขายไม่ได้แล้ว รับเข้าคลังไม่ได้");
  if (!/^\d+$/.test(item.quantity_invoiced) || Number(item.quantity_invoiced) <= 0) {
    problems.push("จำนวนตามใบส่งของต้องมากกว่า 0");
  }
  if (!/^\d+$/.test(item.quantity_actual)) problems.push("ยังไม่ได้กรอกจำนวนที่นับได้จริง");
  if (!isValidMoney(item.unit_cost) || Number(item.unit_cost) <= 0) {
    problems.push("ต้นทุนต่อหน่วยต้องมากกว่า 0");
  }
  return problems;
}

export function PurchaseItemCard({
  item,
  onChange,
  onRemove,
  disabled,
}: {
  item: DraftItem;
  onChange: (changes: Partial<DraftItem>) => void;
  onRemove: () => void;
  disabled?: boolean;
}) {
  const difference = itemDifference(item);
  const lineTotal =
    isValidMoney(item.unit_cost) && /^\d+$/.test(item.quantity_actual)
      ? multiplyMoney(item.unit_cost, Number(item.quantity_actual))
      : null;

  return (
    <Card>
      <CardContent className="space-y-3 pt-5">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <p className="font-medium text-slate-900">{item.medicine_name}</p>
          <Button type="button" variant="outline" size="sm" onClick={onRemove} disabled={disabled}>
            ลบรายการ
          </Button>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label htmlFor={`lot-${item.key}`}>Lot / รุ่น *</Label>
            <Input
              id={`lot-${item.key}`}
              value={item.lot_number}
              disabled={disabled}
              aria-invalid={!item.lot_number.trim()}
              onChange={(event) => onChange({ lot_number: event.target.value })}
            />
          </div>

          <MonthYearInput
            id={`exp-${item.key}`}
            value={item.expiry_date}
            disabled={disabled}
            onChange={(iso: string | null, state: MonthYearState) =>
              onChange({ expiry_date: iso, expiryBlocking: state.blocking })
            }
          />
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <div>
            <Label htmlFor={`inv-${item.key}`}>จำนวนตามใบส่งของ *</Label>
            <div className="flex items-center gap-2">
              <Input
                id={`inv-${item.key}`}
                inputMode="numeric"
                value={item.quantity_invoiced}
                disabled={disabled}
                onChange={(event) => {
                  const digits = event.target.value.replace(/\D/g, "");
                  // Counting defaults to the note until someone counts for real.
                  onChange(
                    item.quantity_actual === item.quantity_invoiced
                      ? { quantity_invoiced: digits, quantity_actual: digits }
                      : { quantity_invoiced: digits },
                  );
                }}
              />
              <span className="text-sm text-slate-500">{item.unit}</span>
            </div>
          </div>

          <div>
            <Label htmlFor={`act-${item.key}`}>จำนวนที่นับได้จริง *</Label>
            <div className="flex items-center gap-2">
              <Input
                id={`act-${item.key}`}
                inputMode="numeric"
                value={item.quantity_actual}
                disabled={disabled}
                onChange={(event) =>
                  onChange({ quantity_actual: event.target.value.replace(/\D/g, "") })
                }
              />
              <span className="text-sm text-slate-500">{item.unit}</span>
            </div>
            {/* Never blocks: a mismatch is a fact to record, not an error. */}
            {difference !== 0 && item.quantity_actual !== "" ? (
              <p className="mt-1 text-xs font-medium text-amber-700">
                ⚠️ {difference < 0 ? "ขาด" : "เกิน"} {Math.abs(difference)} {item.unit}
              </p>
            ) : null}
          </div>

          <div>
            <Label htmlFor={`cost-${item.key}`}>ต้นทุน/{item.unit} *</Label>
            <div className="flex items-center gap-2">
              <Input
                id={`cost-${item.key}`}
                inputMode="decimal"
                value={item.unit_cost}
                disabled={disabled}
                aria-invalid={item.unit_cost !== "" && !isValidMoney(item.unit_cost)}
                onChange={(event) => onChange({ unit_cost: event.target.value })}
              />
              <span className="text-sm text-slate-500">บาท</span>
            </div>
          </div>
        </div>

        <p className="text-sm text-slate-600">
          รวมรายการนี้ <MoneyText value={lineTotal} withUnit className="font-medium text-slate-900" />
          <span className="ml-1 text-xs text-slate-500">(ยอดจริงคิดจากระบบ)</span>
        </p>
      </CardContent>
    </Card>
  );
}
