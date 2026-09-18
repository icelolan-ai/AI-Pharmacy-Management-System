"use client";

import { useMemo } from "react";
import { useRouter } from "next/navigation";

import { useAuth } from "@/components/auth-provider";
import { AccessDenied } from "@/components/common/AccessDenied";
import { DataTable, type Column } from "@/components/common/DataTable";
import { EmptyState } from "@/components/common/EmptyState";
import { ErrorState } from "@/components/common/ErrorState";
import { PageHeader } from "@/components/common/PageHeader";
import { QtyText } from "@/components/common/QtyText";
import { SkeletonTable } from "@/components/common/SkeletonTable";
import { Button } from "@/components/ui/button";
import { listLowStockReport, listStockReport, type LowStockRow } from "@/lib/api/reports";
import { ABILITIES, can } from "@/lib/abilities";
import { useSection } from "@/lib/use-section";

export default function LowStockReportPage() {
  const router = useRouter();
  const { me } = useAuth();
  const allowed = can(me?.role, ABILITIES.viewReports);

  const report = useSection((signal) => listLowStockReport({ signal }), {
    enabled: allowed,
    errorMessage: "โหลดรายงานยาใกล้หมดไม่สำเร็จ",
  });

  // Only to put a unit next to each quantity — /reports/low-stock has no unit field.
  const stock = useSection((signal) => listStockReport({ signal }), {
    enabled: allowed,
    errorMessage: "โหลดหน่วยนับไม่สำเร็จ",
  });

  const unitById = useMemo(() => {
    const map = new Map<string, string>();
    for (const row of stock.data?.items ?? []) map.set(row.medicine_id, row.unit);
    return map;
  }, [stock.data]);

  // Out of stock first, then the biggest shortfall (the API already sorts, this
  // only guarantees the "zero on top" rule).
  const rows = useMemo(() => {
    return [...(report.data?.items ?? [])].sort(
      (a, b) =>
        Number(a.available_quantity !== 0) - Number(b.available_quantity !== 0) ||
        b.shortage - a.shortage ||
        a.name.localeCompare(b.name, "th"),
    );
  }, [report.data]);

  if (me && !allowed) {
    return (
      <div className="space-y-4">
        <PageHeader title="ยาใกล้หมด" />
        <AccessDenied />
      </div>
    );
  }

  const columns: Column<LowStockRow>[] = [
    {
      key: "medicine",
      header: "ยา",
      cell: (row) => <span className="font-medium text-slate-900">{row.name}</span>,
    },
    {
      key: "available",
      header: "คงเหลือ",
      align: "right",
      cell: (row) => (
        <QtyText
          value={row.available_quantity}
          unit={unitById.get(row.medicine_id)}
          low={row.available_quantity === 0}
        />
      ),
    },
    {
      key: "reorder",
      header: "จุดสั่งซื้อ",
      align: "right",
      cell: (row) => <QtyText value={row.reorder_point} unit={unitById.get(row.medicine_id)} />,
    },
    {
      key: "shortage",
      header: "ขาดอีกเท่าไร",
      align: "right",
      cell: (row) => (
        <QtyText
          value={row.shortage}
          unit={unitById.get(row.medicine_id)}
          className="font-medium text-amber-700"
        />
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <PageHeader
        title="ยาใกล้หมด"
        description="ยาที่คงเหลือถึงหรือต่ำกว่าจุดสั่งซื้อที่ตั้งไว้"
        action={
          <Button variant="outline" onClick={report.reload} disabled={report.loading}>
            {report.loading ? "กำลังโหลด..." : "รีเฟรช"}
          </Button>
        }
      />

      {report.error ? (
        <ErrorState message={report.error} onRetry={report.reload} retrying={report.loading} />
      ) : null}

      {report.loading ? (
        <SkeletonTable rows={6} columns={4} />
      ) : !report.error && rows.length === 0 ? (
        <EmptyState
          title="ไม่มียาที่ต่ำกว่าจุดสั่งซื้อ"
          description="นับเฉพาะยาที่ตั้งจุดสั่งซื้อไว้แล้ว"
          action={<Button variant="outline" onClick={() => router.push("/stock")}>ไปหน้าคลังยา</Button>}
        />
      ) : !report.error ? (
        <DataTable
          columns={columns}
          rows={rows}
          rowKey={(row) => row.medicine_id}
          onRowClick={(row) => router.push(`/stock/${row.medicine_id}`)}
          caption="ยาที่ต่ำกว่าจุดสั่งซื้อ"
        />
      ) : null}

      <p className="text-xs text-slate-500">
        นับเฉพาะยาที่ตั้งจุดสั่งซื้อไว้แล้ว — ยาที่ยังไม่ตั้งค่าจะไม่ปรากฏในหน้านี้
      </p>
    </div>
  );
}
