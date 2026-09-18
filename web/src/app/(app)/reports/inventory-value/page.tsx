"use client";

import { useAuth } from "@/components/auth-provider";
import { AccessDenied } from "@/components/common/AccessDenied";
import { DataTable, type Column } from "@/components/common/DataTable";
import { EmptyState } from "@/components/common/EmptyState";
import { ErrorState } from "@/components/common/ErrorState";
import { MoneyText } from "@/components/common/MoneyText";
import { PageHeader } from "@/components/common/PageHeader";
import { SkeletonTable } from "@/components/common/SkeletonTable";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { getInventoryValue, type CategoryValue, type MedicineValue } from "@/lib/api/reports";
import { ABILITIES, can } from "@/lib/abilities";
import { useSection } from "@/lib/use-section";

export default function InventoryValuePage() {
  const { me } = useAuth();
  // D20: owner only — the backend answers 403 for anyone else regardless.
  const allowed = can(me?.role, ABILITIES.viewInventoryValue);

  const report = useSection((signal) => getInventoryValue({ signal }), {
    enabled: allowed,
    errorMessage: "โหลดรายงานมูลค่าคลังไม่สำเร็จ",
  });

  if (me && !allowed) {
    return (
      <div className="space-y-4">
        <PageHeader title="มูลค่าคลังยา" />
        <AccessDenied />
      </div>
    );
  }

  const data = report.data;

  const medicineColumns: Column<MedicineValue>[] = [
    {
      key: "name",
      header: "ยา",
      cell: (row) => <span className="font-medium text-slate-900">{row.name}</span>,
    },
    {
      key: "sellable",
      header: "ขายได้",
      align: "right",
      cell: (row) => <MoneyText value={row.sellable_value} />,
    },
    {
      key: "expired",
      header: "ขายไม่ได้แล้ว",
      align: "right",
      cell: (row) => <MoneyText value={row.expired_value} />,
    },
    {
      key: "total",
      header: "รวม",
      align: "right",
      cell: (row) => <MoneyText value={row.total_value} className="font-medium" />,
    },
  ];

  const categoryColumns: Column<CategoryValue>[] = [
    { key: "category", header: "หมวดหมู่", cell: (row) => row.category },
    {
      key: "sellable",
      header: "ขายได้",
      align: "right",
      cell: (row) => <MoneyText value={row.sellable_value} />,
    },
    {
      key: "expired",
      header: "ขายไม่ได้แล้ว",
      align: "right",
      cell: (row) => <MoneyText value={row.expired_value} />,
    },
    {
      key: "total",
      header: "รวม",
      align: "right",
      cell: (row) => <MoneyText value={row.total_value} className="font-medium" />,
    },
  ];

  return (
    <div className="space-y-4">
      <PageHeader
        title="มูลค่าคลังยา"
        description="มูลค่าต้นทุนของยาที่อยู่ในคลังตอนนี้"
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
      ) : data ? (
        <>
          <Card>
            <CardContent className="pt-6">
              <p className="text-sm text-slate-600">มูลค่าคลังรวม</p>
              <p className="mt-1 text-4xl font-semibold text-slate-900">
                <MoneyText value={data.total_value} withUnit />
              </p>
              <div className="mt-4 flex flex-wrap gap-6 text-sm">
                <span className="text-slate-600">
                  ขายได้ <MoneyText value={data.sellable_value} withUnit className="text-slate-900" />
                </span>
                <span className="text-slate-600">
                  ขายไม่ได้แล้ว{" "}
                  <MoneyText value={data.expired_value} withUnit className="text-red-700" />
                </span>
              </div>
            </CardContent>
          </Card>

          <section className="space-y-2">
            <h2 className="text-sm font-semibold text-slate-900">
              แยกตามยา (มากไปน้อย · {data.by_medicine.total} รายการ)
            </h2>
            {data.by_medicine.items.length === 0 ? (
              <EmptyState title="ยังไม่มีมูลค่าคลัง" />
            ) : (
              <DataTable
                columns={medicineColumns}
                rows={data.by_medicine.items}
                rowKey={(row) => row.medicine_id}
                caption="มูลค่าคลังแยกตามยา"
              />
            )}
          </section>

          <section className="space-y-2">
            <h2 className="text-sm font-semibold text-slate-900">สรุปตามหมวดหมู่</h2>
            {data.by_category.length === 0 ? (
              <EmptyState title="ยังไม่มีข้อมูลหมวดหมู่" />
            ) : (
              <DataTable
                columns={categoryColumns}
                rows={data.by_category}
                rowKey={(row) => row.category}
                caption="มูลค่าคลังแยกตามหมวดหมู่"
              />
            )}
          </section>
        </>
      ) : null}
    </div>
  );
}
