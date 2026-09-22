"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { useAuth } from "@/components/auth-provider";
import { DataTable, type Column } from "@/components/common/DataTable";
import { EmptyState } from "@/components/common/EmptyState";
import { AccessDenied } from "@/components/common/AccessDenied";
import { ErrorState } from "@/components/common/ErrorState";
import { MedicineSearchInput } from "@/components/common/MedicineSearchInput";
import { PageHeader } from "@/components/common/PageHeader";
import { SkeletonTable } from "@/components/common/SkeletonTable";
import { SupplierFormDialog } from "@/components/suppliers/SupplierFormDialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { listSuppliers, type Supplier } from "@/lib/api/suppliers";
import { ABILITIES, can } from "@/lib/abilities";
import { useSection } from "@/lib/use-section";

export default function SuppliersPage() {
  const router = useRouter();
  const { me } = useAuth();
  const allowed = can(me?.role, ABILITIES.viewSuppliers);

  const [term, setTerm] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);

  const list = useSection((signal) => listSuppliers({ q: term, limit: 50, signal }), {
    enabled: allowed,
    errorMessage: "โหลดข้อมูลผู้จำหน่ายไม่สำเร็จ",
    deps: [term],
  });
  const suppliers = list.data?.items ?? [];
  const total = list.data?.total ?? 0;
  const { error, loading } = list;

  if (me && !allowed) {
    return (
      <div className="space-y-4">
        <PageHeader title="ผู้จำหน่าย" />
        <AccessDenied />
      </div>
    );
  }

  const columns: Column<Supplier>[] = [
    {
      key: "name",
      header: "ชื่อผู้จำหน่าย",
      cell: (row) => <span className="font-medium text-slate-900">{row.name}</span>,
    },
    { key: "contact", header: "ผู้ติดต่อ", cell: (row) => row.contact_person ?? "-" },
    { key: "phone", header: "เบอร์โทร", cell: (row) => row.phone ?? "-" },
    {
      key: "lead",
      header: "ส่งของภายใน (วัน)",
      align: "right",
      cell: (row) => (row.lead_time_days === null ? "-" : row.lead_time_days),
    },
  ];

  return (
    <div className="space-y-4">
      <PageHeader
        title="ผู้จำหน่าย"
        description="รายชื่อผู้จำหน่ายที่ร้านสั่งซื้อยา"
        action={
          <Button onClick={() => setDialogOpen(true)}>เพิ่มผู้จำหน่าย</Button>
        }
      />

      <div className="flex flex-wrap items-end justify-between gap-3">
        <MedicineSearchInput
          id="supplier-search"
          value={term}
          onDebouncedChange={setTerm}
          placeholder="ชื่อผู้จำหน่าย"
        />
        {!loading && !error ? <Badge variant="secondary">ทั้งหมด {total} ราย</Badge> : null}
      </div>

      {error ? <ErrorState message={error} onRetry={list.reload} retrying={loading} /> : null}

      {loading ? (
        <SkeletonTable rows={5} columns={4} />
      ) : !error && suppliers.length === 0 ? (
        <EmptyState
          title={term ? "ไม่พบผู้จำหน่ายที่ค้นหา" : "ยังไม่มีข้อมูลผู้จำหน่าย"}
          action={!term ? <Button onClick={() => setDialogOpen(true)}>เพิ่มผู้จำหน่าย</Button> : null}
        />
      ) : !error ? (
        <DataTable
          columns={columns}
          rows={suppliers}
          rowKey={(row) => row.id}
          onRowClick={(row) => router.push(`/suppliers/${row.id}`)}
          caption="รายชื่อผู้จำหน่าย"
        />
      ) : null}

      <SupplierFormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onSaved={list.reload}
      />
    </div>
  );
}
