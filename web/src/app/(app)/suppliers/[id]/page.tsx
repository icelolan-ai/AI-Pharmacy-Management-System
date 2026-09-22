"use client";

import { use, useState } from "react";
import { useRouter } from "next/navigation";

import { useAuth } from "@/components/auth-provider";
import { AccessDenied } from "@/components/common/AccessDenied";
import { ErrorState } from "@/components/common/ErrorState";
import { PageHeader } from "@/components/common/PageHeader";
import { SkeletonTable } from "@/components/common/SkeletonTable";
import { SupplierFormDialog } from "@/components/suppliers/SupplierFormDialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getSupplier, type Supplier } from "@/lib/api/suppliers";
import { ABILITIES, can } from "@/lib/abilities";
import { formatDateTimeBE } from "@/lib/format/date";
import { useSection } from "@/lib/use-section";

export default function SupplierDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const { me } = useAuth();
  const allowed = can(me?.role, ABILITIES.viewSuppliers);

  const [dialogOpen, setDialogOpen] = useState(false);

  const detail = useSection((signal) => getSupplier(id, signal), {
    enabled: allowed,
    errorMessage: "โหลดข้อมูลผู้จำหน่ายไม่สำเร็จ",
    deps: [id],
  });
  const supplier = detail.data;
  const { error, loading } = detail;

  if (me && !allowed) {
    return (
      <div className="space-y-4">
        <PageHeader title="ผู้จำหน่าย" />
        <AccessDenied />
      </div>
    );
  }

  const rows: { label: string; value: React.ReactNode }[] = supplier
    ? [
        { label: "ผู้ติดต่อ", value: supplier.contact_person ?? "-" },
        { label: "เบอร์โทร", value: supplier.phone ?? "-" },
        { label: "อีเมล", value: supplier.email ?? "-" },
        { label: "ที่อยู่", value: supplier.address ?? "-" },
        {
          label: "ส่งของภายใน",
          value: supplier.lead_time_days === null ? "-" : `${supplier.lead_time_days} วัน`,
        },
        { label: "เพิ่มเมื่อ", value: formatDateTimeBE(supplier.created_at) },
        { label: "แก้ไขล่าสุด", value: formatDateTimeBE(supplier.updated_at) },
      ]
    : [];

  return (
    <div className="space-y-4">
      <PageHeader
        title={supplier?.name ?? "ผู้จำหน่าย"}
        description="ข้อมูลผู้จำหน่าย"
        action={
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => router.push("/suppliers")}>
              กลับไปรายการ
            </Button>
            {supplier ? <Button onClick={() => setDialogOpen(true)}>แก้ไข</Button> : null}
          </div>
        }
      />

      {error ? <ErrorState message={error} onRetry={detail.reload} retrying={loading} /> : null}

      {loading ? (
        <SkeletonTable rows={4} columns={2} />
      ) : supplier ? (
        <Card className="max-w-2xl">
          <CardHeader>
            <CardTitle className="text-base">รายละเอียด</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid grid-cols-[9rem_1fr] gap-y-3 text-sm">
              {rows.map((row) => (
                <div key={row.label} className="contents">
                  <dt className="text-slate-500">{row.label}</dt>
                  <dd className="whitespace-pre-line">{row.value}</dd>
                </div>
              ))}
            </dl>
          </CardContent>
        </Card>
      ) : null}

      {supplier ? (
        <SupplierFormDialog
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          supplier={supplier}
          onSaved={detail.reload}
        />
      ) : null}
    </div>
  );
}
