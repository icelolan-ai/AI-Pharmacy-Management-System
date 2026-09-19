"use client";

import { useState } from "react";
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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { listPurchases, type PurchaseStatus, type PurchaseSummary } from "@/lib/api/purchases";
import { ABILITIES, can } from "@/lib/abilities";
import { formatDateBE } from "@/lib/format/date";
import { useSection } from "@/lib/use-section";

const PAGE_SIZE = 25;

const STATUS_FILTERS: { value: PurchaseStatus | "all"; label: string }[] = [
  { value: "all", label: "ทั้งหมด" },
  { value: "draft", label: "ร่าง" },
  { value: "confirmed", label: "ยืนยันแล้ว" },
  { value: "discrepancy", label: "จำนวนไม่ตรง" },
];

const STATUS_LABEL: Record<PurchaseStatus, string> = {
  draft: "ร่าง",
  confirmed: "ยืนยันแล้ว",
  discrepancy: "จำนวนไม่ตรง",
};

/** Read only: a confirmed receipt cannot be edited or deleted from here. */
export default function PurchaseHistoryPage() {
  const router = useRouter();
  const { me } = useAuth();
  const allowed = can(me?.role, ABILITIES.viewReports);
  // D32: cost and totals are for owner and pharmacist only.
  const canSeeCost = can(me?.role, ABILITIES.viewCost);

  const [range, setRange] = useState<DateRange>(() => lastDays(30));
  const [status, setStatus] = useState<PurchaseStatus | "all">("all");
  const [offset, setOffset] = useState(0);

  // Status and dates are filtered by the API, never in the browser.
  const purchases = useSection(
    (signal) =>
      listPurchases({
        status: status === "all" ? undefined : status,
        dateFrom: range.from,
        dateTo: range.to,
        limit: PAGE_SIZE,
        offset,
        signal,
      }),
    {
      enabled: allowed,
      errorMessage: "โหลดประวัติการรับสินค้าไม่สำเร็จ",
      deps: [status, range.from, range.to, offset],
    },
  );

  if (me && !allowed) {
    return (
      <div className="space-y-4">
        <PageHeader title="ประวัติการรับสินค้า" />
        <AccessDenied />
      </div>
    );
  }

  const rows = purchases.data?.items ?? [];

  const columns: Column<PurchaseSummary>[] = [
    {
      key: "no",
      header: "เลขที่ใบรับ",
      cell: (row) => (
        <span className="font-medium text-slate-900">{row.purchase_no ?? "— ร่าง —"}</span>
      ),
    },
    { key: "invoice", header: "เลขที่ใบส่งของ", cell: (row) => row.invoice_no ?? "-" },
    { key: "supplier", header: "ผู้จำหน่าย", cell: (row) => row.supplier_name ?? "-" },
    {
      key: "date",
      header: "วันที่",
      cell: (row) => (
        <span className="text-sm text-slate-600">{formatDateBE(row.purchase_date)}</span>
      ),
    },
    {
      key: "status",
      header: "สถานะ",
      cell: (row) => (
        <Badge variant={row.status === "discrepancy" ? "destructive" : "secondary"}>
          {row.status === "discrepancy" ? "⚠️ " : ""}
          {STATUS_LABEL[row.status]}
        </Badge>
      ),
    },
  ];

  if (canSeeCost) {
    columns.push({
      key: "total",
      header: "มูลค่า",
      align: "right",
      cell: (row) => <MoneyText value={row.total_amount} />,
    });
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="ประวัติการรับสินค้า"
        description="ดูอย่างเดียว ใบที่ยืนยันแล้วแก้ไขไม่ได้"
      />

      <Alert>
        <AlertDescription>ใบรับสินค้าที่ยืนยันแล้วดูได้อย่างเดียว แก้ไขไม่ได้</AlertDescription>
      </Alert>

      <div className="flex flex-wrap items-end justify-between gap-3">
        <DateRangeFilter
          value={range}
          busy={purchases.loading}
          onChange={(next) => {
            setRange(next);
            setOffset(0);
          }}
        />
        <div className="flex gap-1 pb-5" role="group" aria-label="กรองตามสถานะ">
          {STATUS_FILTERS.map((entry) => (
            <Button
              key={entry.value}
              type="button"
              size="sm"
              variant={status === entry.value ? "default" : "outline"}
              aria-pressed={status === entry.value}
              onClick={() => {
                setStatus(entry.value);
                setOffset(0);
              }}
            >
              {entry.label}
            </Button>
          ))}
        </div>
      </div>

      {purchases.error ? (
        <ErrorState message={purchases.error} onRetry={purchases.reload} retrying={purchases.loading} />
      ) : null}

      {purchases.loading ? (
        <SkeletonTable rows={6} columns={canSeeCost ? 6 : 5} />
      ) : rows.length === 0 ? (
        <EmptyState title="ไม่มีใบรับสินค้าในเงื่อนไขที่เลือก" />
      ) : (
        <>
          <DataTable
            columns={columns}
            rows={rows}
            rowKey={(row) => row.id}
            onRowClick={(row) => router.push(`/history/purchases/${row.id}`)}
            caption="ประวัติการรับสินค้า"
          />
          <Pagination
            total={purchases.data?.total ?? 0}
            limit={PAGE_SIZE}
            offset={offset}
            onOffsetChange={setOffset}
            busy={purchases.loading}
          />
        </>
      )}
    </div>
  );
}
