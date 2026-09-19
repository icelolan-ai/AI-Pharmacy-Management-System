"use client";

import { use } from "react";
import { useRouter } from "next/navigation";

import { useAuth } from "@/components/auth-provider";
import { AccessDenied } from "@/components/common/AccessDenied";
import { DataTable, type Column } from "@/components/common/DataTable";
import { ErrorState } from "@/components/common/ErrorState";
import { MoneyText } from "@/components/common/MoneyText";
import { PageHeader } from "@/components/common/PageHeader";
import { SkeletonTable } from "@/components/common/SkeletonTable";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { getSale, groupSaleItems, type Sale, type SaleLine } from "@/lib/api/sales";
import { ABILITIES, can } from "@/lib/abilities";
import { formatDateTimeBE, formatExpiryBE } from "@/lib/format/date";
import { useSection } from "@/lib/use-section";

/** One bill, read only. Reprinting goes through the existing print route with
 *  ?copy=1 — there is no second receipt page to keep in step. */
export default function SaleDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const { me } = useAuth();
  const allowed = can(me?.role, ABILITIES.viewReports);
  const canSeeValue = can(me?.role, ABILITIES.viewCost);

  const saleSection = useSection((signal) => getSale(id, signal), {
    enabled: allowed,
    errorMessage: "โหลดรายละเอียดบิลไม่สำเร็จ",
    deps: [id],
  });
  const sale = saleSection.data;

  if (me && !allowed) {
    return (
      <div className="space-y-4">
        <PageHeader title="รายละเอียดบิล" />
        <AccessDenied />
      </div>
    );
  }

  const lines: SaleLine[] = sale ? groupSaleItems(sale.items) : [];

  const columns: Column<SaleLine>[] = [
    {
      key: "medicine",
      header: "ยา",
      cell: (line) => (
        <div>
          <p className="font-medium text-slate-900">{line.medicine_name ?? "-"}</p>
          {line.lots.map((lot) => (
            <p key={lot.lot_id} className="text-xs text-slate-500">
              Lot {lot.lot_number} · EXP {formatExpiryBE(lot.expiry_date)} · {lot.quantity}
            </p>
          ))}
        </div>
      ),
    },
    {
      key: "quantity",
      header: "จำนวน",
      align: "right",
      cell: (line) => <span className="tabular-nums">{line.quantity}</span>,
    },
  ];

  if (canSeeValue) {
    columns.push(
      {
        key: "price",
        header: "ราคา/หน่วย",
        align: "right",
        cell: (line) => <MoneyText value={line.unit_price} />,
      },
      {
        key: "subtotal",
        header: "รวม",
        align: "right",
        cell: (line) => <MoneyText value={line.subtotal} />,
      },
    );
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title={sale ? `บิล ${sale.sale_no}` : "รายละเอียดบิล"}
        description={sale ? `${formatDateTimeBE(sale.sale_date)} น.` : undefined}
        action={
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => router.push("/history/sales")}>
              กลับไปประวัติ
            </Button>
            {sale ? (
              <Button
                onClick={() =>
                  // Reprint is always a copy (?copy=1), on the existing print page.
                  window.open(`/print/sale/${sale.id}?copy=1`, "_blank", "noopener")
                }
              >
                🖨 พิมพ์ใบเสร็จ {sale.sale_no}
              </Button>
            ) : null}
          </div>
        }
      />

      <Alert>
        <AlertDescription>
          บิลที่บันทึกแล้วยกเลิกไม่ได้ — หากขายผิด ให้ใช้การปรับ Stock พร้อมระบุเหตุผล
        </AlertDescription>
      </Alert>

      {saleSection.error ? (
        <ErrorState
          message={saleSection.error}
          onRetry={saleSection.reload}
          retrying={saleSection.loading}
        />
      ) : null}

      {saleSection.loading ? (
        <SkeletonTable rows={4} columns={canSeeValue ? 4 : 2} />
      ) : sale ? (
        <>
          <Card>
            <CardContent className="grid gap-2 pt-6 text-sm sm:grid-cols-2">
              <p>
                <span className="text-slate-500">เลขที่บิล</span>{" "}
                <span className="font-medium">{sale.sale_no}</span>
              </p>
              <p>
                <span className="text-slate-500">วันเวลา</span>{" "}
                {formatDateTimeBE(sale.sale_date)} น.
              </p>
              {sale.sold_by_name ? (
                <p>
                  <span className="text-slate-500">ผู้ขาย</span> {sale.sold_by_name}
                </p>
              ) : null}
              {canSeeValue ? (
                <p>
                  <span className="text-slate-500">ยอดรวม</span>{" "}
                  <MoneyText value={sale.total_amount} withUnit className="font-medium" />
                </p>
              ) : null}
            </CardContent>
          </Card>

          <DataTable
            columns={columns}
            rows={lines}
            rowKey={(line) => `${line.medicine_id}-${line.unit_price}`}
            caption="รายการในบิล"
          />
        </>
      ) : null}
    </div>
  );
}
