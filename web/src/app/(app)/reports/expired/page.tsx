"use client";

import { useAuth } from "@/components/auth-provider";
import { AccessDenied } from "@/components/common/AccessDenied";
import { DataTable, type Column } from "@/components/common/DataTable";
import { EmptyState } from "@/components/common/EmptyState";
import { ErrorState } from "@/components/common/ErrorState";
import { MoneyText } from "@/components/common/MoneyText";
import { PageHeader } from "@/components/common/PageHeader";
import { QtyText } from "@/components/common/QtyText";
import { SkeletonTable } from "@/components/common/SkeletonTable";
import { useAdjustFromReport } from "@/components/reports/useAdjustFromReport";
import { AdjustStockDialog } from "@/components/stock/AdjustStockDialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { listExpiredReport, type ExpiredRow } from "@/lib/api/reports";
import { ABILITIES, can } from "@/lib/abilities";
import { formatDateBE } from "@/lib/format/date";
import { sumMoney } from "@/lib/format/money";
import { useSection } from "@/lib/use-section";

export default function ExpiredReportPage() {
  const { me } = useAuth();
  const allowed = can(me?.role, ABILITIES.viewReports);
  const canSeeValue = can(me?.role, ABILITIES.viewCost);
  const canAdjust = can(me?.role, ABILITIES.adjustStock);

  const report = useSection((signal) => listExpiredReport({ signal }), {
    enabled: allowed,
    errorMessage: "โหลดรายงานยาหมดอายุไม่สำเร็จ",
  });
  const adjust = useAdjustFromReport(() => report.reload());

  if (me && !allowed) {
    return (
      <div className="space-y-4">
        <PageHeader title="หมดอายุแล้ว" />
        <AccessDenied />
      </div>
    );
  }

  const rows = report.data?.items ?? [];
  const totalLoss = canSeeValue ? sumMoney(rows.map((row) => row.stock_value)) : null;

  const columns: Column<ExpiredRow>[] = [
    {
      key: "medicine",
      header: "ยา",
      cell: (row) => <span className="font-medium text-slate-900">{row.medicine_name}</span>,
    },
    { key: "lot", header: "ล็อต", cell: (row) => row.lot_number },
    {
      key: "expiry",
      header: "หมดอายุเมื่อ",
      cell: (row) => (
        <span className="text-sm text-slate-600">{formatDateBE(row.expiry_date)}</span>
      ),
    },
    {
      key: "days",
      header: "ขายไม่ได้มาแล้วกี่วัน",
      align: "right",
      cell: (row) => (
        <span className="tabular-nums text-sm font-medium text-slate-700">
          {row.days_expired} วัน
        </span>
      ),
    },
    {
      key: "quantity",
      header: "จำนวน",
      align: "right",
      // /reports/expired does not carry a unit, so the number stands alone here.
      cell: (row) => <QtyText value={row.quantity_remaining} />,
    },
  ];

  if (canSeeValue) {
    columns.push({
      key: "value",
      header: "มูลค่า",
      align: "right",
      cell: (row) => <MoneyText value={row.stock_value} />,
    });
  }

  if (canAdjust) {
    columns.push({
      key: "actions",
      header: "",
      align: "right",
      cell: (row) => (
        <Button
          variant="outline"
          size="sm"
          disabled={adjust.busy}
          onClick={(event) => {
            event.stopPropagation();
            void adjust.openFor(row.lot_id);
          }}
        >
          ปรับ Stock
        </Button>
      ),
    });
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="ยาที่ขายไม่ได้แล้ว"
        description="ล็อตที่เลยวันขายสุดท้ายแต่ยังมีจำนวนคงเหลือในระบบ"
        action={
          <Button variant="outline" onClick={report.reload} disabled={report.loading}>
            {report.loading ? "กำลังโหลด..." : "รีเฟรช"}
          </Button>
        }
      />

      {report.error ? (
        <ErrorState message={report.error} onRetry={report.reload} retrying={report.loading} />
      ) : null}
      {adjust.error ? <ErrorState message={adjust.error} /> : null}

      {!report.loading && !report.error && rows.length > 0 ? (
        <>
          {canSeeValue ? (
            <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3">
              <p className="text-sm font-medium text-red-800">
                มูลค่าความสูญเสียรวม <MoneyText value={totalLoss} withUnit />
              </p>
            </div>
          ) : null}
          <Alert>
            <AlertDescription>
              ของเหล่านี้ยังอยู่บนชั้นจริง — ตรวจสอบและนำออกจากชั้นวาง
            </AlertDescription>
          </Alert>
        </>
      ) : null}

      {report.loading ? (
        <SkeletonTable rows={6} columns={canSeeValue ? 6 : 5} />
      ) : !report.error && rows.length === 0 ? (
        <EmptyState title="ไม่มียาที่ขายไม่ได้แล้วค้างอยู่ในระบบ" />
      ) : !report.error ? (
        <DataTable
          columns={columns}
          rows={rows}
          rowKey={(row) => row.lot_id}
          caption="ล็อตที่ขายไม่ได้แล้ว"
        />
      ) : null}

      {canAdjust ? (
        <AdjustStockDialog
          open={adjust.open}
          onOpenChange={adjust.setOpen}
          lot={adjust.lot}
          unit={adjust.unit}
          onAdjusted={adjust.handleAdjusted}
        />
      ) : null}
    </div>
  );
}
