"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { useAuth } from "@/components/auth-provider";
import { DataTable, type Column } from "@/components/common/DataTable";
import { EmptyState } from "@/components/common/EmptyState";
import { ErrorState } from "@/components/common/ErrorState";
import { MedicineSearchInput } from "@/components/common/MedicineSearchInput";
import { MoneyText } from "@/components/common/MoneyText";
import { PageHeader } from "@/components/common/PageHeader";
import { QtyText } from "@/components/common/QtyText";
import { RequireAbility } from "@/components/common/RequireAbility";
import { SkeletonTable } from "@/components/common/SkeletonTable";
import { MedicineFormDialog } from "@/components/medicines/MedicineFormDialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ApiError, isAbortError } from "@/lib/api/client";
import { searchMedicines, type Medicine } from "@/lib/api/medicines";
import { ABILITIES, can } from "@/lib/abilities";

export default function StockPage() {
  const { me } = useAuth();
  const canSeeCost = can(me?.role, ABILITIES.viewCost);
  const canManage = can(me?.role, ABILITIES.manageMedicines);

  const [term, setTerm] = useState("");
  const [medicines, setMedicines] = useState<Medicine[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Medicine | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const load = useCallback(async (searchTerm: string) => {
    abortRef.current?.abort(); // cancel the previous search
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    setError(null);
    try {
      const page = await searchMedicines({ q: searchTerm, limit: 50, signal: controller.signal });
      setMedicines(page.items);
      setTotal(page.total);
    } catch (loadError) {
      if (isAbortError(loadError)) return; // a newer search is already running
      setMedicines([]);
      setTotal(0);
      setError(loadError instanceof ApiError ? loadError.message : "โหลดข้อมูลยาไม่สำเร็จ");
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(term);
    return () => abortRef.current?.abort();
  }, [term, load]);

  const columns: Column<Medicine>[] = [
    {
      key: "name",
      header: "ชื่อยา",
      cell: (row) => (
        <div>
          <p className="font-medium text-slate-900">{row.name}</p>
          <p className="text-xs text-slate-500">
            {[row.strength, row.dosage_form].filter(Boolean).join(" · ") || "-"}
          </p>
        </div>
      ),
    },
    { key: "category", header: "หมวดหมู่", cell: (row) => row.category ?? "-" },
    {
      key: "barcode",
      header: "บาร์โค้ด",
      cell: (row) => <span className="tabular-nums text-slate-600">{row.barcode ?? "-"}</span>,
    },
    {
      key: "available",
      header: "คงเหลือ",
      align: "right",
      cell: (row) => (
        <QtyText
          value={row.available_quantity}
          low={row.reorder_point !== null && row.available_quantity <= row.reorder_point}
        />
      ),
    },
    {
      key: "reorder",
      header: "จุดสั่งซื้อ",
      align: "right",
      cell: (row) =>
        row.reorder_point === null ? (
          <span className="text-slate-400">ไม่เตือน</span>
        ) : (
          <QtyText value={row.reorder_point} />
        ),
    },
  ];

  if (canSeeCost) {
    columns.push({
      key: "price",
      header: "ราคาขาย",
      align: "right",
      cell: (row) => <MoneyText value={row.selling_price} />,
    });
  }

  if (canManage) {
    columns.push({
      key: "actions",
      header: "",
      align: "right",
      cell: (row) => (
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            setEditing(row);
            setDialogOpen(true);
          }}
        >
          แก้ไข
        </Button>
      ),
    });
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="สต็อกยา"
        description="รายการยาทั้งหมดและจำนวนคงเหลือที่ขายได้"
        action={
          <RequireAbility ability={ABILITIES.manageMedicines}>
            <Button
              onClick={() => {
                setEditing(null);
                setDialogOpen(true);
              }}
            >
              เพิ่มยาใหม่
            </Button>
          </RequireAbility>
        }
      />

      <div className="flex flex-wrap items-end justify-between gap-3">
        <MedicineSearchInput value={term} onDebouncedChange={setTerm} />
        {!loading && !error ? (
          <Badge variant="secondary">ทั้งหมด {total} รายการ</Badge>
        ) : null}
      </div>

      {error ? <ErrorState message={error} onRetry={() => void load(term)} retrying={loading} /> : null}

      {loading ? (
        <SkeletonTable rows={6} columns={canSeeCost ? 6 : 5} />
      ) : !error && medicines.length === 0 ? (
        <EmptyState
          title={term ? "ไม่พบยาที่ค้นหา" : "ยังไม่มีข้อมูลยา"}
          description={term ? "ลองค้นด้วยชื่อ ชื่อสามัญ หรือบาร์โค้ดอีกครั้ง" : undefined}
          action={
            canManage && !term ? (
              <Button
                onClick={() => {
                  setEditing(null);
                  setDialogOpen(true);
                }}
              >
                เพิ่มยาใหม่
              </Button>
            ) : null
          }
        />
      ) : !error ? (
        <DataTable columns={columns} rows={medicines} rowKey={(row) => row.id} caption="รายการยา" />
      ) : null}

      {canManage ? (
        <MedicineFormDialog
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          medicine={editing}
          canSetPrice={canSeeCost}
          onSaved={() => void load(term)}
        />
      ) : null}
    </div>
  );
}
