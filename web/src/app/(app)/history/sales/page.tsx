"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { useAuth } from "@/components/auth-provider";
import { AccessDenied } from "@/components/common/AccessDenied";
import { DataTable, type Column } from "@/components/common/DataTable";
import { DateRangeFilter, lastDays, type DateRange } from "@/components/common/DateRangeFilter";
import { EmptyState } from "@/components/common/EmptyState";
import { ErrorState } from "@/components/common/ErrorState";
import { MoneyText } from "@/components/common/MoneyText";
import { PageHeader } from "@/components/common/PageHeader";
import { Pagination } from "@/components/common/Pagination";
import { SkeletonTable } from "@/components/common/SkeletonTable";
import { Alert, AlertDescription } from "@/components/ui/alert";

import { listSales, type SaleSummary } from "@/lib/api/sales";
import { ABILITIES, can } from "@/lib/abilities";
import { formatDateTimeBE } from "@/lib/format/date";
import { useSection } from "@/lib/use-section";

const PAGE_SIZE = 25;

/** Read-only by design: a bill that has been rung cannot be edited, deleted or
 *  cancelled here. Putting it right goes through a stock adjustment, which
 *  leaves its own trail (กฎข้อ 21). */
export default function SalesHistoryPage() {
  const router = useRouter();
  const { me } = useAuth();
  const allowed = can(me?.role, ABILITIES.viewReports);
  // D33: the page gate above is viewReports = owner + pharmacist, the same
  // pair as viewCost, so there is no second layer to apply here.

  const [range, setRange] = useState<DateRange>(() => lastDays(1)); // today
  const [offset, setOffset] = useState(0);

  // The API does the filtering and the counting; the browser never does.
  const sales = useSection(
    (signal) =>
      listSales({ dateFrom: range.from, dateTo: range.to, limit: PAGE_SIZE, offset, signal }),
    {
      enabled: allowed,
      errorMessage: "โหลดประวัติการขายไม่สำเร็จ",
      deps: [range.from, range.to, offset],
    },
  );

  if (me && !allowed) {
    return (
      <div className="space-y-4">
        <PageHeader title="ประวัติการขาย" />
        <AccessDenied />
      </div>
    );
  }

  const rows = sales.data?.items ?? [];

  const columns: Column<SaleSummary>[] = [
    {
      key: "sale_no",
      header: "เลขที่บิล",
      cell: (row) => <span className="font-medium text-slate-900">{row.sale_no}</span>,
    },
    {
      key: "when",
      header: "วันเวลา",
      cell: (row) => (
        <span className="text-sm text-slate-600">{formatDateTimeBE(row.sale_date)} น.</span>
      ),
    },
  ];

  columns.push({
    key: "total",
    header: "ยอดรวม",
    align: "right",
    cell: (row) => <MoneyText value={row.total_amount} />,
  });

  return (
    <div className="space-y-4">
      <PageHeader title="ประวัติการขาย" description="ดูอย่างเดียว แก้ไขหรือยกเลิกบิลไม่ได้" />

      <Alert>
        <AlertDescription>
          บิลที่บันทึกแล้วยกเลิกไม่ได้ — หากขายผิด ให้ใช้การปรับ Stock พร้อมระบุเหตุผล{" "}
          <Link href="/stock" className="underline underline-offset-2">
            ไปหน้าคลังยา
          </Link>
        </AlertDescription>
      </Alert>

      <DateRangeFilter
        value={range}
        busy={sales.loading}
        onChange={(next) => {
          setRange(next);
          setOffset(0);
        }}
      />

      {sales.error ? (
        <ErrorState message={sales.error} onRetry={sales.reload} retrying={sales.loading} />
      ) : null}

      {sales.loading ? (
        <SkeletonTable rows={6} columns={3} />
      ) : rows.length === 0 ? (
        <EmptyState title="ไม่มีการขายในช่วงวันที่ที่เลือก" />
      ) : (
        <>
          <DataTable
            columns={columns}
            rows={rows}
            rowKey={(row) => row.id}
            onRowClick={(row) => router.push(`/history/sales/${row.id}`)}
            caption="ประวัติการขาย"
          />
          <Pagination
            total={sales.data?.total ?? 0}
            limit={PAGE_SIZE}
            offset={offset}
            onOffsetChange={setOffset}
            busy={sales.loading}
          />
        </>
      )}
    </div>
  );
}
