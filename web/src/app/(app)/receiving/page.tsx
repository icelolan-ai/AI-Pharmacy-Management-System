"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { useAuth } from "@/components/auth-provider";
import { AccessDenied } from "@/components/common/AccessDenied";
import { DataTable, type Column } from "@/components/common/DataTable";
import { EmptyState } from "@/components/common/EmptyState";
import { ErrorState } from "@/components/common/ErrorState";
import { MoneyText } from "@/components/common/MoneyText";
import { PageHeader } from "@/components/common/PageHeader";
import { SkeletonTable } from "@/components/common/SkeletonTable";
import { UnfinishedDraftBanner } from "@/components/receiving/DraftBanner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ApiError } from "@/lib/api/client";
import { deletePurchase, listPurchases, type PurchaseSummary } from "@/lib/api/purchases";
import { ABILITIES, can } from "@/lib/abilities";
import { formatDateBE } from "@/lib/format/date";
import { useSection } from "@/lib/use-section";

const STATUS_LABEL: Record<PurchaseSummary["status"], string> = {
  draft: "ร่าง",
  confirmed: "รับเข้าแล้ว",
  discrepancy: "จำนวนไม่ตรง",
};

export default function ReceivingPage() {
  const router = useRouter();
  const { me } = useAuth();
  const allowed = can(me?.role, ABILITIES.receiveStock);

  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const drafts = useSection((signal) => listPurchases({ status: "draft", signal }), {
    enabled: allowed,
    errorMessage: "โหลดใบรับที่ค้างไว้ไม่สำเร็จ",
  });
  const recent = useSection((signal) => listPurchases({ limit: 25, signal }), {
    enabled: allowed,
    errorMessage: "โหลดประวัติการรับสินค้าไม่สำเร็จ",
  });

  const reloadAll = useCallback(() => {
    drafts.reload();
    recent.reload();
  }, [drafts, recent]);

  async function discardDraft(id: string) {
    if (!window.confirm("ทิ้งร่างใบรับสินค้านี้หรือไม่? ข้อมูลที่กรอกไว้จะหายไป")) return;
    setBusy(true);
    setActionError(null);
    try {
      await deletePurchase(id);
      reloadAll();
    } catch (error) {
      setActionError(error instanceof ApiError ? error.message : "ทิ้งร่างไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  }

  if (me && !allowed) {
    return (
      <div className="space-y-4">
        <PageHeader title="รับสินค้า" />
        <AccessDenied />
      </div>
    );
  }

  const draftRows = drafts.data?.items ?? [];
  const recentRows = recent.data?.items ?? [];

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
      cell: (row) => <span className="text-sm text-slate-600">{formatDateBE(row.purchase_date)}</span>,
    },
    {
      key: "status",
      header: "สถานะ",
      cell: (row) => (
        <Badge variant={row.status === "discrepancy" ? "destructive" : "secondary"}>
          {STATUS_LABEL[row.status]}
        </Badge>
      ),
    },
    {
      key: "total",
      header: "มูลค่า",
      align: "right",
      cell: (row) => <MoneyText value={row.total_amount} />,
    },
  ];

  return (
    <div className="space-y-4">
      <PageHeader
        title="รับสินค้า"
        description="บันทึกของที่รับเข้าคลัง 2 ขั้นตอน: ตามใบส่งของ แล้วนับของจริง"
        action={<Button onClick={() => router.push("/receiving/new")}>รับสินค้าใหม่</Button>}
      />

      {actionError ? <ErrorState message={actionError} /> : null}

      {draftRows.map((draft) => (
        <UnfinishedDraftBanner
          key={draft.id}
          supplierName={draft.supplier_name}
          busy={busy}
          onContinue={() => router.push(`/receiving/${draft.id}`)}
          onDiscard={() => void discardDraft(draft.id)}
        />
      ))}

      {recent.error ? (
        <ErrorState message={recent.error} onRetry={recent.reload} retrying={recent.loading} />
      ) : null}

      {recent.loading ? (
        <SkeletonTable rows={5} columns={6} />
      ) : recentRows.length === 0 ? (
        <EmptyState
          title="ยังไม่มีการรับสินค้า"
          description="เริ่มจากกดปุ่ม รับสินค้าใหม่"
          action={<Button onClick={() => router.push("/receiving/new")}>รับสินค้าใหม่</Button>}
        />
      ) : (
        <DataTable
          columns={columns}
          rows={recentRows}
          rowKey={(row) => row.id}
          onRowClick={(row) => router.push(`/receiving/${row.id}`)}
          caption="ประวัติการรับสินค้า"
        />
      )}
    </div>
  );
}
