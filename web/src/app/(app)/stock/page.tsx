"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { useAuth } from "@/components/auth-provider";
import { EmptyState } from "@/components/common/EmptyState";
import { ErrorState } from "@/components/common/ErrorState";
import { PageHeader } from "@/components/common/PageHeader";
import { RequireAbility } from "@/components/common/RequireAbility";
import { SkeletonTable } from "@/components/common/SkeletonTable";
import { MedicineFormDialog } from "@/components/medicines/MedicineFormDialog";
import { StockFilters, type StockFilter } from "@/components/stock/StockFilters";
import { StockTable } from "@/components/stock/StockTable";
import { Button } from "@/components/ui/button";
import { isExpiringSoon, isLowStock, listStockReport, type StockRow } from "@/lib/api/reports";
import { ABILITIES, can } from "@/lib/abilities";
import { useSection } from "@/lib/use-section";

export default function StockPage() {
  const router = useRouter();
  const { me } = useAuth();
  const canSeeValue = can(me?.role, ABILITIES.viewCost);
  const canManage = can(me?.role, ABILITIES.manageMedicines);

  const [term, setTerm] = useState("");
  const [filter, setFilter] = useState<StockFilter>("all");
  const [dialogOpen, setDialogOpen] = useState(false);

  // useSection aborts the previous request itself when the term changes.
  const stock = useSection((signal) => listStockReport({ q: term, signal }), {
    errorMessage: "โหลดข้อมูลสต็อกไม่สำเร็จ",
    deps: [term],
  });
  const rows = stock.data?.items ?? [];
  const total = stock.data?.total ?? 0;

  // Both toggles work on the rows already loaded — no extra request.
  const shown = useMemo(() => {
    if (filter === "low") return rows.filter(isLowStock);
    if (filter === "expiring") return rows.filter(isExpiringSoon);
    return rows;
  }, [rows, filter]);

  return (
    <div className="space-y-4">
      <PageHeader
        title="คลังยา"
        description="จำนวนที่ขายได้ ล็อต และวันหมดอายุของยาแต่ละรายการ"
        action={
          <RequireAbility ability={ABILITIES.manageMedicines}>
            <Button onClick={() => setDialogOpen(true)}>เพิ่มยาใหม่</Button>
          </RequireAbility>
        }
      />

      <StockFilters
        term={term}
        onTermChange={setTerm}
        filter={filter}
        onFilterChange={setFilter}
        shownCount={shown.length}
        totalCount={total}
        busy={stock.loading || Boolean(stock.error)}
      />

      {stock.error ? (
        <ErrorState message={stock.error} onRetry={stock.reload} retrying={stock.loading} />
      ) : null}

      {stock.loading ? (
        <SkeletonTable rows={6} columns={canSeeValue ? 5 : 4} />
      ) : !stock.error && shown.length === 0 ? (
        <EmptyState
          title={
            rows.length > 0
              ? "ไม่มียาที่ตรงกับตัวกรอง"
              : term
                ? "ไม่พบยาที่ค้นหา"
                : "ยังไม่มีข้อมูลยา"
          }
          description={
            rows.length > 0
              ? "ลองเลือก “ทั้งหมด” เพื่อดูรายการทั้งหมด"
              : term
                ? "ลองค้นด้วยชื่อ ชื่อสามัญ หรือบาร์โค้ดอีกครั้ง"
                : undefined
          }
          action={
            canManage && !term && rows.length === 0 ? (
              <Button onClick={() => setDialogOpen(true)}>เพิ่มยาใหม่</Button>
            ) : null
          }
        />
      ) : !stock.error ? (
        <StockTable
          rows={shown}
          canSeeValue={canSeeValue}
          onRowClick={(row) => router.push(`/stock/${row.medicine_id}`)}
        />
      ) : null}

      {canManage ? (
        <MedicineFormDialog
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          medicine={null}
          canSetPrice={canSeeValue}
          onSaved={stock.reload}
        />
      ) : null}
    </div>
  );
}
