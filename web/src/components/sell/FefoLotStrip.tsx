import { Button } from "@/components/ui/button";
import type { CartItem } from "@/lib/hooks/use-sell-cart";
import { describeExpiry } from "@/lib/format/expiry";

/** The 📍 strip: which lots this line would actually cut, in FEFO order.
 *  Loading never blocks typing — it just says so on one line. */
export function FefoLotStrip({
  item,
  unit,
  onRetry,
}: {
  item: CartItem;
  unit: string;
  onRetry: () => void;
}) {
  if (item.previewState === "loading" || item.previewState === "idle") {
    return <p className="text-xs text-slate-500">กำลังตรวจสอบล็อตที่จะตัด...</p>;
  }

  if (item.previewState === "error") {
    return (
      <p className="flex flex-wrap items-center gap-2 text-xs text-red-600">
        {item.errorMessage ?? "ตรวจสอบล็อตไม่สำเร็จ"}
        <Button type="button" variant="outline" size="sm" onClick={onRetry}>
          ลองใหม่
        </Button>
      </p>
    );
  }

  const preview = item.preview;
  if (!preview) return null;

  if (!preview.sufficient) {
    return (
      <p className="text-xs font-medium text-red-600">
        มี {item.medicine.name} เหลือขายได้ {preview.available} {unit} แต่ระบุ {preview.requested}{" "}
        {unit}
      </p>
    );
  }

  return (
    <div className="space-y-0.5">
      <p className="text-xs font-medium text-slate-700">📍 จะตัดจากล็อต</p>
      {preview.allocations.map((allocation) => {
        const expiry = describeExpiry(allocation.expiry_date);
        const risky = expiry.days <= 89;
        return (
          <p key={allocation.lot_id} className="text-xs text-slate-600">
            {allocation.lot_number} — {allocation.quantity} {unit}
            {risky ? (
              <span className={`ml-1 ${expiry.className}`}>
                ({expiry.detail} · {expiry.headline})
              </span>
            ) : null}
          </p>
        );
      })}
    </div>
  );
}
