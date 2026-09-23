"use client";

import { use } from "react";
import { useRouter } from "next/navigation";

import { useAuth } from "@/components/auth-provider";
import { AccessDenied } from "@/components/common/AccessDenied";
import { DataTable, type Column } from "@/components/common/DataTable";
import { ErrorState } from "@/components/common/ErrorState";
import { ExpiryCell } from "@/components/common/ExpiryCell";
import { MoneyText } from "@/components/common/MoneyText";
import { PageHeader } from "@/components/common/PageHeader";
import { QtyText } from "@/components/common/QtyText";
import { SkeletonTable } from "@/components/common/SkeletonTable";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  getPurchase,
  hasMismatch,
  itemDifference,
  itemHasMismatch,
  type Purchase,
  type PurchaseItem,
} from "@/lib/api/purchases";
import { ABILITIES, can } from "@/lib/abilities";
import { formatDateBE, formatDateTimeBE } from "@/lib/format/date";
import { useSection } from "@/lib/use-section";

/** One goods-received note, read only. Printing reuses /print/purchase/[id]. */
export default function PurchaseDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const { me } = useAuth();
  const allowed = can(me?.role, ABILITIES.viewReports);
  // D32: the page itself is the gate — viewReports is owner + pharmacist,
  // so nobody without the right to see cost ever reaches this render.

  const purchaseSection = useSection((signal) => getPurchase(id, signal), {
    enabled: allowed,
    errorMessage: "โหลดใบรับสินค้าไม่สำเร็จ",
    deps: [id],
  });
  const purchase = purchaseSection.data;

  if (me && !allowed) {
    return (
      <div className="space-y-4">
        <PageHeader title="รายละเอียดใบรับสินค้า" />
        <AccessDenied />
      </div>
    );
  }

  const columns: Column<PurchaseItem>[] = [
    {
      key: "medicine",
      header: "ยา",
      cell: (item) => (
        <div>
          <p className="font-medium text-slate-900">{item.medicine_name ?? "-"}</p>
          <p className="text-xs text-slate-500">Lot {item.lot_number}</p>
        </div>
      ),
    },
    {
      key: "expiry",
      header: "หมดอายุ",
      // D19: the wording and the maths both come from lib/format/expiry.
      cell: (item) => <ExpiryCell expiryDate={item.expiry_date} />,
    },
    {
      key: "invoiced",
      header: "ตามใบส่งของ",
      align: "right",
      cell: (item) => <QtyText value={item.quantity_invoiced} />,
    },
    {
      key: "actual",
      header: "รับจริง",
      align: "right",
      cell: (item) => {
        const difference = itemDifference(item);
        return (
          <div className="flex flex-col items-end">
            <QtyText value={item.quantity_actual ?? item.quantity_invoiced} />
            {itemHasMismatch(item) ? (
              <span className="text-xs font-medium text-amber-700">
                ⚠️ {difference < 0 ? "ขาด" : "เกิน"} {Math.abs(difference)}
              </span>
            ) : null}
          </div>
        );
      },
    },
  ];

  columns.push(
    {
      key: "cost",
      header: "ต้นทุน/หน่วย",
      align: "right",
      cell: (item) => <MoneyText value={item.unit_cost} />,
    },
    {
      key: "subtotal",
      header: "รวม",
      align: "right",
      cell: (item) => <MoneyText value={item.subtotal} />,
    },
  );

  const canPrint = purchase !== null && purchase.status !== "draft";

  return (
    <div className="space-y-4">
      <PageHeader
        title={purchase?.purchase_no ? `ใบรับ ${purchase.purchase_no}` : "รายละเอียดใบรับสินค้า"}
        description={
          purchase?.confirmed_at ? `รับเข้าเมื่อ ${formatDateTimeBE(purchase.confirmed_at)} น.` : undefined
        }
        action={
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => router.push("/history/purchases")}>
              กลับไปประวัติ
            </Button>
            {canPrint ? (
              <Button
                onClick={() => window.open(`/print/purchase/${purchase.id}`, "_blank", "noopener")}
              >
                🖨 พิมพ์ใบรับสินค้า {purchase.purchase_no}
              </Button>
            ) : null}
          </div>
        }
      />

      <Alert>
        <AlertDescription>ใบรับสินค้าที่ยืนยันแล้วดูได้อย่างเดียว แก้ไขไม่ได้</AlertDescription>
      </Alert>

      {purchaseSection.error ? (
        <ErrorState
          message={purchaseSection.error}
          onRetry={purchaseSection.reload}
          retrying={purchaseSection.loading}
        />
      ) : null}

      {purchaseSection.loading ? (
        <SkeletonTable rows={4} columns={6} />
      ) : purchase ? (
        <>
          {hasMismatch(purchase) ? (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
              <p className="text-sm font-medium text-amber-900">
                ⚠️ ใบนี้จำนวนไม่ตรงกับใบส่งของ
              </p>
            </div>
          ) : null}

          <Card>
            <CardContent className="grid gap-2 pt-6 text-sm sm:grid-cols-2">
              <p>
                <span className="text-slate-500">เลขที่ใบรับ</span>{" "}
                <span className="font-medium">{purchase.purchase_no ?? "— ร่าง —"}</span>
              </p>
              <p>
                <span className="text-slate-500">เลขที่ใบส่งของ</span>{" "}
                {purchase.invoice_no ?? "-"}
              </p>
              <p>
                <span className="text-slate-500">ผู้จำหน่าย</span> {purchase.supplier_name ?? "-"}
              </p>
              <p>
                <span className="text-slate-500">วันที่ตามใบส่งของ</span>{" "}
                {formatDateBE(purchase.purchase_date)}
              </p>
              {purchase.created_by_name ? (
                <p>
                  <span className="text-slate-500">ผู้รับของ</span> {purchase.created_by_name}
                </p>
              ) : null}
              <p>
                <span className="text-slate-500">สถานะ</span>{" "}
                <Badge variant={hasMismatch(purchase) ? "destructive" : "secondary"}>
                  {purchase.status === "draft"
                    ? "ร่าง"
                    : purchase.status === "confirmed"
                      ? "ยืนยันแล้ว"
                      : "จำนวนไม่ตรง"}
                </Badge>
              </p>
              <p>
                <span className="text-slate-500">มูลค่ารวม</span>{" "}
                <MoneyText value={purchase.total_amount} withUnit className="font-medium" />
              </p>
            </CardContent>
          </Card>

          <DataTable
            columns={columns}
            rows={purchase.items}
            rowKey={(item) => item.id}
            caption="รายการในใบรับสินค้า"
          />
        </>
      ) : null}
    </div>
  );
}
