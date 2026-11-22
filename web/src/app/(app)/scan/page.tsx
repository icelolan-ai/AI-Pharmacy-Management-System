"use client";

import { FileText } from "lucide-react";
import { useRouter } from "next/navigation";

import { useAuth } from "@/components/auth-provider";
import { AccessDenied } from "@/components/common/AccessDenied";
import { DataTable, type Column } from "@/components/common/DataTable";
import { EmptyState } from "@/components/common/EmptyState";
import { ErrorState } from "@/components/common/ErrorState";
import { PageHeader } from "@/components/common/PageHeader";
import { SkeletonTable } from "@/components/common/SkeletonTable";
import { Badge } from "@/components/ui/badge";
import { ABILITIES, can } from "@/lib/abilities";
import { listScans, type ScanListItem } from "@/lib/api/invoice-scans";
import { formatDateTimeBE } from "@/lib/format/date";
import { statusWord } from "@/lib/scan/review";
import { useSection } from "@/lib/use-section";

/** ใบส่งของที่ถ่าย (6.4): every scan, newest first, its state in words.
 *  The home page's "ใบที่สแกนค้าง" card opens this page. */
export default function ScansPage() {
  const { me } = useAuth();
  const router = useRouter();
  const allowed = can(me?.role, ABILITIES.receiveStock);
  const scans = useSection((signal) => listScans(signal), {
    enabled: allowed,
    errorMessage: "โหลดรายการใบไม่สำเร็จ",
  });

  if (me && !allowed) {
    return (
      <div className="page-stack">
        <PageHeader title="ถ่ายใบส่งของ" />
        <AccessDenied />
      </div>
    );
  }

  const rows = scans.data ?? [];
  const columns: Column<ScanListItem>[] = [
    { key: "created_at", header: "ถ่ายเมื่อ", cell: (row) => formatDateTimeBE(row.created_at) },
    { key: "pages", header: "จำนวนหน้า", align: "right", cell: (row) => `${row.page_count} หน้า` },
    { key: "by", header: "ผู้ถ่าย", cell: (row) => row.created_by_name ?? "-" },
    { key: "status", header: "สถานะ", cell: (row) => <Badge variant="secondary">{statusWord(row.status)}</Badge> },
  ];

  return (
    <div className="page-stack">
      <PageHeader
        title="ถ่ายใบส่งของ"
        description="ใบที่ถ่ายไว้ ใหม่สุดอยู่บน กดที่ใบเพื่อตรวจ"
        primaryAction={{ label: "ถ่ายใบใหม่", onClick: () => router.push("/scan/new") }}
      />
      {scans.error ? <ErrorState message={scans.error} onRetry={scans.reload} retrying={scans.loading} /> : null}
      {scans.loading && !scans.data ? (
        <SkeletonTable rows={5} columns={4} />
      ) : rows.length === 0 ? (
        <EmptyState title="ยังไม่มีใบที่ถ่าย" description="กดถ่ายใบใหม่ แล้วถ่ายใบส่งของทีละหน้า" />
      ) : (
        <DataTable
          columns={columns}
          rows={rows}
          rowKey={(row) => row.id}
          onRowClick={(row) => router.push(`/scan/${row.id}`)}
          caption="ใบส่งของที่ถ่ายไว้"
          phoneRow={{
            icon: () => <FileText className="size-5" />,
            title: (row) => statusWord(row.status),
            subtitle: (row) => (
              <>
                {formatDateTimeBE(row.created_at)} <span className="whitespace-nowrap">· {row.page_count} หน้า</span>
              </>
            ),
          }}
        />
      )}
    </div>
  );
}
