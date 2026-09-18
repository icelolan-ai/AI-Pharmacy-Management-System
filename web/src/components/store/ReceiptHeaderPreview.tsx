import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { StoreProfile } from "@/lib/api/store";

/** Fields the receipt header prints, in the order it prints them. */
export type ReceiptHeader = Pick<
  StoreProfile,
  "name" | "address" | "phone" | "license_no" | "tax_id"
>;

const PLACEHOLDER = "— ยังไม่ได้กรอก —";

/** What the top of a printed receipt will look like with the current data.
 *  Nothing here is editable: it is a mirror of the form on the left. */
export function ReceiptHeaderPreview({ store }: { store: ReceiptHeader }) {
  const lines: { label: string; value: string | null }[] = [
    { label: "ที่อยู่", value: store.address },
    { label: "โทร.", value: store.phone },
    { label: "เลขที่ใบอนุญาต", value: store.license_no },
    { label: "เลขประจำตัวผู้เสียภาษี", value: store.tax_id },
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">ตัวอย่างหัวใบเสร็จ</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="rounded-md border border-dashed border-slate-300 bg-white p-4 text-center">
          <p className="text-base font-semibold text-slate-900">
            {store.name?.trim() || PLACEHOLDER}
          </p>
          <div className="mt-2 space-y-0.5 text-xs text-slate-600">
            {lines.map((line) =>
              line.value?.trim() ? (
                <p key={line.label} className="whitespace-pre-line">
                  {line.label === "ที่อยู่" ? line.value : `${line.label} ${line.value}`}
                </p>
              ) : null,
            )}
          </div>
          <div className="mt-3 border-t border-dashed border-slate-300 pt-2 text-xs text-slate-400">
            ใบเสร็จรับเงิน
          </div>
        </div>
        <p className="mt-2 text-xs text-slate-500">
          ช่องที่เว้นว่างไว้จะไม่ถูกพิมพ์บนใบเสร็จ
        </p>
      </CardContent>
    </Card>
  );
}
