"use client";

import { useCallback, useEffect, useState } from "react";
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
import { ApiError, isAbortError, type Page } from "@/lib/api/client";
import { listSales, type SaleSummary } from "@/lib/api/sales";
import { ABILITIES, can } from "@/lib/abilities";
import { formatDateTimeBE } from "@/lib/format/date";

const PAGE_SIZE = 25;

/** Read-only by design: a bill that has been rung cannot be edited, deleted or
 *  cancelled here. Putting it right goes through a stock adjustment, which
 *  leaves its own trail (กฎข้อ 21). */
export default function SalesHistoryPage() {
  const router = useRouter();
  const { me } = useAuth();
  const allowed = can(me?.role, ABILITIES.viewReports);
  const canSeeValue = can(me?.role, ABILITIES.viewCost);

  const [range, setRange] = useState<DateRange>(() => lastDays(1)); // today
  const [offset, setOffset] = useState(0);
  const [data, setData] = useState<Page<SaleSummary> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    async (signal: AbortSignal) => {
      setLoading(true);
      setError(null);
      try {
        // The API does the filtering and the counting; the browser never does.
        const page = await listSales({
          dateFrom: range.from,
          dateTo: range.to,
          limit: PAGE_SIZE,
          offset,
          signal,
        });
        if (!signal.aborted) setData(page);
      } catch (loadError) {
        if (isAbortError(loadError) || signal.aborted) return;
        setData(null);
        setError(loadError instanceof ApiError ? loadError.message : "โหลดประวัติการขายไม่สำเร็จ");
      } finally {
        if (!signal.aborted) setLoading(false);
      }
    },
    [range.from, range.to, offset],
  );

  useEffect(() => {
    if (!allowed) return;
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [allowed, load]);

  if (me && !allowed) {
    return (
      <div className="space-y-4">
        <PageHeader title="ประวัติการขาย" />
        <AccessDenied />
      </div>
    );
  }

  const rows = data?.items ?? [];

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

  if (canSeeValue) {
    columns.push({
      key: "total",
      header: "ยอดรวม",
      align: "right",
      cell: (row) => <MoneyText value={row.total_amount} />,
    });
  }

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
        busy={loading}
        onChange={(next) => {
          setRange(next);
          setOffset(0);
        }}
      />

      {error ? (
        <ErrorState
          message={error}
          onRetry={() => {
            const controller = new AbortController();
            void load(controller.signal);
          }}
          retrying={loading}
        />
      ) : null}

      {loading ? (
        <SkeletonTable rows={6} columns={canSeeValue ? 3 : 2} />
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
            total={data?.total ?? 0}
            limit={PAGE_SIZE}
            offset={offset}
            onOffsetChange={setOffset}
            busy={loading}
          />
        </>
      )}
    </div>
  );
}
