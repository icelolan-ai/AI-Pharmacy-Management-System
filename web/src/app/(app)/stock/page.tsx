"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import { ApiError, isAbortError } from "@/lib/api/client";
import { isExpiringSoon, isLowStock, listStockReport, type StockRow } from "@/lib/api/reports";
import { ABILITIES, can } from "@/lib/abilities";

export default function StockPage() {
  const router = useRouter();
  const { me } = useAuth();
  const canSeeValue = can(me?.role, ABILITIES.viewCost);
  const canManage = can(me?.role, ABILITIES.manageMedicines);

  const [term, setTerm] = useState("");
  const [filter, setFilter] = useState<StockFilter>("all");
  const [rows, setRows] = useState<StockRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const load = useCallback(async (searchTerm: string) => {
    abortRef.current?.abort(); // cancel the previous search
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    setError(null);
    try {
      const page = await listStockReport({ q: searchTerm, signal: controller.signal });
      setRows(page.items);
      setTotal(page.total);
    } catch (loadError) {
      if (isAbortError(loadError)) return; // a newer search is already running
      setRows([]);
      setTotal(0);
      setError(loadError instanceof ApiError ? loadError.message : "โหลดข้อมูลสต็อกไม่สำเร็จ");
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(term);
    return () => abortRef.current?.abort();
  }, [term, load]);

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
        busy={loading || Boolean(error)}
      />

      {error ? <ErrorState message={error} onRetry={() => void load(term)} retrying={loading} /> : null}

      {loading ? (
        <SkeletonTable rows={6} columns={canSeeValue ? 5 : 4} />
      ) : !error && shown.length === 0 ? (
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
      ) : !error ? (
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
          onSaved={() => void load(term)}
        />
      ) : null}
    </div>
  );
}
