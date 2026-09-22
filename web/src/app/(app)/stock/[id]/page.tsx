"use client";

import { use, useState } from "react";
import { useRouter } from "next/navigation";

import { useAuth } from "@/components/auth-provider";
import { ErrorState } from "@/components/common/ErrorState";
import { PageHeader } from "@/components/common/PageHeader";
import { SkeletonTable } from "@/components/common/SkeletonTable";
import { MedicineFormDialog } from "@/components/medicines/MedicineFormDialog";
import { AdjustStockDialog } from "@/components/stock/AdjustStockDialog";
import { isSellableLot, LotTable, orderLotsForDisplay } from "@/components/stock/LotTable";
import { MedicineSummaryCards } from "@/components/stock/MedicineSummaryCards";
import { RecentTransactions } from "@/components/stock/RecentTransactions";
import { Button } from "@/components/ui/button";
import { ApiError } from "@/lib/api/client";
import { getLot, listLotTransactions, listMedicineLots, type InventoryTransaction, type Lot } from "@/lib/api/lots";
import { getMedicine, type Medicine } from "@/lib/api/medicines";
import { listStockReport, type StockRow } from "@/lib/api/reports";
import { ABILITIES, can } from "@/lib/abilities";
import { useSection } from "@/lib/use-section";

export default function MedicineStockPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const { me } = useAuth();
  const canSeeCost = can(me?.role, ABILITIES.viewCost);
  const canAdjust = can(me?.role, ABILITIES.adjustStock);
  const canManage = can(me?.role, ABILITIES.manageMedicines);

  const [editOpen, setEditOpen] = useState(false);
  const [adjustOpen, setAdjustOpen] = useState(false);
  const [adjustLotValue, setAdjustLotValue] = useState<Lot | null>(null);
  const [opening, setOpening] = useState<string | null>(null);
  const [openError, setOpenError] = useState<string | null>(null);

  // One section, because the later calls depend on what the first two return.
  const detail = useSection(
    async (signal) => {
      const [medicineResult, lotsResult] = await Promise.all([
        getMedicine(id, signal),
        listMedicineLots(id, { includeInactive: true, signal }),
      ]);

      // Value comes from the report so staff never receives it at all.
      const stockRow = canSeeCost
        ? ((await listStockReport({ q: medicineResult.name, limit: 200, signal })).items.find(
            (row) => row.medicine_id === id,
          ) ?? null)
        : null;

      // History of the lot that will be sold first (FEFO rank 1).
      const first = orderLotsForDisplay(lotsResult.items).find((entry) => entry.fefoRank === 1);
      const transactions =
        first && canSeeCost
          ? (await listLotTransactions(first.lot.id, { limit: 20, signal })).items
          : [];

      return {
        medicine: medicineResult,
        lots: lotsResult.items,
        stockRow,
        historyLotNumber: first?.lot.lot_number ?? null,
        transactions,
      };
    },
    { errorMessage: "โหลดข้อมูลยาไม่สำเร็จ", deps: [id, canSeeCost] },
  );

  const medicine = detail.data?.medicine ?? null;
  const lots = detail.data?.lots ?? [];
  const transactions = detail.data?.transactions ?? [];
  const historyLotNumber = detail.data?.historyLotNumber ?? null;
  const stockRow = detail.data?.stockRow ?? null;
  const loading = detail.loading;
  const error = openError ?? detail.error;

  /** D23 step 1: always reload the lot before the dialog opens, so the number
   *  the user counts against is the one the backend will check. */
  async function openAdjust(lot: Lot) {
    setOpening(lot.id);
    setOpenError(null);
    try {
      setAdjustLotValue(await getLot(lot.id));
      setAdjustOpen(true);
    } catch (openError) {
      setOpenError(
        openError instanceof ApiError ? openError.message : "โหลดข้อมูลล็อตไม่สำเร็จ",
      );
    } finally {
      setOpening(null);
    }
  }

  const unit = medicine?.unit ?? "";
  const unsellableCount = lots.filter((lot) => !isSellableLot(lot)).length;

  return (
    <div className="space-y-4">
      <PageHeader
        title={medicine?.name ?? "รายละเอียดยา"}
        description={
          medicine
            ? [medicine.strength, medicine.dosage_form, medicine.category]
                .filter(Boolean)
                .join(" · ") || undefined
            : undefined
        }
        action={
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => router.push("/stock")}>
              กลับไปคลังยา
            </Button>
            {medicine && canManage ? (
              <Button onClick={() => setEditOpen(true)}>แก้ไขข้อมูลยา</Button>
            ) : null}
          </div>
        }
      />

      {error ? <ErrorState message={error} onRetry={detail.reload} retrying={loading} /> : null}

      {loading ? (
        <SkeletonTable rows={5} columns={4} />
      ) : medicine ? (
        <>
          <MedicineSummaryCards
            lots={lots}
            unit={unit}
            canSeeValue={canSeeCost}
            stockValue={stockRow?.available_value}
          />

          {unsellableCount > 0 ? (
            <p className="text-xs text-slate-500">
              มี {unsellableCount} ล็อตที่ขายไม่ได้แล้ว แสดงไว้ท้ายตารางเพื่อให้ปรับออกจากสต็อกได้
            </p>
          ) : null}

          <LotTable
            lots={lots}
            unit={unit}
            canSeeCost={canSeeCost}
            canAdjust={canAdjust}
            adjustBusy={opening !== null}
            onAdjust={(lot) => void openAdjust(lot)}
          />

          {canSeeCost ? (
            <RecentTransactions
              lotNumber={historyLotNumber}
              transactions={transactions}
              unit={unit}
            />
          ) : null}
        </>
      ) : null}

      {canManage && medicine ? (
        <MedicineFormDialog
          open={editOpen}
          onOpenChange={setEditOpen}
          medicine={medicine}
          canSetPrice={canSeeCost}
          onSaved={detail.reload}
        />
      ) : null}

      {canAdjust ? (
        <AdjustStockDialog
          open={adjustOpen}
          onOpenChange={setAdjustOpen}
          lot={adjustLotValue}
          unit={unit}
          onAdjusted={detail.reload}
        />
      ) : null}
    </div>
  );
}
