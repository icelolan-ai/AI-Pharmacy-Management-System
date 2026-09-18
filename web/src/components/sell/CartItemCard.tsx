"use client";

import { useEffect, useRef } from "react";

import { MoneyText } from "@/components/common/MoneyText";
import { FefoLotStrip } from "@/components/sell/FefoLotStrip";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import type { CartItem } from "@/lib/hooks/use-sell-cart";
import { multiplyMoney } from "@/lib/format/money";

/** One medicine in the basket. Staff sees the price as plain text and no
 *  discount control at all (D11). */
export function CartItemCard({
  item,
  focused,
  canSeePrice,
  onQuantityChange,
  onRemove,
  onRetryPreview,
}: {
  item: CartItem;
  focused: boolean;
  canSeePrice: boolean;
  onQuantityChange: (quantity: number) => void;
  onRemove: () => void;
  onRetryPreview: () => void;
}) {
  const quantityRef = useRef<HTMLInputElement>(null);
  const unit = item.medicine.unit;

  // The line just touched gets its quantity selected, ready to be typed over.
  useEffect(() => {
    if (focused) {
      quantityRef.current?.focus();
      quantityRef.current?.select();
    }
  }, [focused]);

  const lineTotal = item.medicine.selling_price
    ? multiplyMoney(item.medicine.selling_price, item.quantity)
    : null;

  return (
    <Card
      data-medicine-id={item.medicine.id}
      className={item.shortage ? "border-red-400 ring-2 ring-red-100" : undefined}
    >
      <CardContent className="space-y-2 pt-5">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="font-medium text-slate-900">{item.medicine.name}</p>
            <p className="text-xs text-slate-500">
              <strong className="font-semibold text-slate-700">
                {[item.medicine.strength, item.medicine.dosage_form].filter(Boolean).join(" · ") ||
                  "-"}
              </strong>
            </p>
          </div>
          <Button type="button" variant="outline" size="sm" onClick={onRemove}>
            ลบ
          </Button>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <Input
              ref={quantityRef}
              inputMode="numeric"
              aria-label={`จำนวน ${item.medicine.name}`}
              className="max-w-24"
              value={String(item.quantity)}
              onChange={(event) => {
                const digits = event.target.value.replace(/\D/g, "");
                if (digits === "") return;
                onQuantityChange(Number(digits));
              }}
            />
            <span className="text-sm text-slate-500">{unit}</span>
          </div>

          {canSeePrice ? (
            <span className="text-sm text-slate-600">
              <MoneyText value={item.medicine.selling_price} /> × {item.quantity} ={" "}
              <MoneyText value={lineTotal} className="font-medium text-slate-900" />
            </span>
          ) : (
            <span className="text-sm text-slate-600">
              ราคา <MoneyText value={item.medicine.selling_price} withUnit />
            </span>
          )}
        </div>

        {item.shortage ? (
          <p className="text-xs font-medium text-red-600">
            สต็อกไม่พอ: ต้องการ {item.shortage.requested} {unit} แต่มี {item.shortage.available}{" "}
            {unit}
          </p>
        ) : null}

        <FefoLotStrip item={item} unit={unit} onRetry={onRetryPreview} />
      </CardContent>
    </Card>
  );
}
