"use client";

import { use, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { useAuth } from "@/components/auth-provider";
import { AccessDenied } from "@/components/common/AccessDenied";
import { ErrorState } from "@/components/common/ErrorState";
import { MedicineSearchInput } from "@/components/common/MedicineSearchInput";
import { MoneyText } from "@/components/common/MoneyText";
import { PageHeader } from "@/components/common/PageHeader";
import { DraftStatus } from "@/components/receiving/DraftBanner";
import {
  itemDifference,
  itemProblems,
  PurchaseItemCard,
  type DraftItem,
} from "@/components/receiving/PurchaseItemCard";
import { ReviewStep } from "@/components/receiving/ReviewStep";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ApiError, isAbortError } from "@/lib/api/client";
import { listMedicines, type Medicine } from "@/lib/api/medicines";
import { confirmPurchase, getPurchase, type ConfirmResult, type PurchaseInput } from "@/lib/api/purchases";
import { listSuppliers, type Supplier } from "@/lib/api/suppliers";
import { ABILITIES, can } from "@/lib/abilities";
import { formatDateBE, todayBangkokISO } from "@/lib/format/date";
import { isValidMoney, multiplyMoney, normalizeMoneyInput, sumMoney } from "@/lib/format/money";
import { usePurchaseDraft } from "@/lib/hooks/use-purchase-draft";
import { useUnsavedChangesWarning } from "@/lib/use-unsaved-changes-warning";

let keyCounter = 0;
const nextKey = () => `item-${(keyCounter += 1)}`;

export default function ReceivingEditorPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const { me } = useAuth();
  const allowed = can(me?.role, ABILITIES.receiveStock);
  const isNew = id === "new";

  const [purchaseId, setPurchaseId] = useState<string | null>(isNew ? null : id);
  const [step, setStep] = useState<1 | 2>(1);
  const [loading, setLoading] = useState(!isNew);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [locked, setLocked] = useState(false); // already confirmed: read only

  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [supplierId, setSupplierId] = useState("");
  const [invoiceNo, setInvoiceNo] = useState("");
  const [purchaseDate, setPurchaseDate] = useState(todayBangkokISO());
  const [items, setItems] = useState<DraftItem[]>([]);

  const [term, setTerm] = useState("");
  const [results, setResults] = useState<Medicine[]>([]);
  const [confirming, setConfirming] = useState(false);
  const [confirmError, setConfirmError] = useState<string | null>(null);
  const [result, setResult] = useState<ConfirmResult | null>(null);

  const draft = usePurchaseDraft({
    purchaseId,
    onCreated: (created) => {
      setPurchaseId(created.id);
      // Keep the URL honest without a navigation that would remount the form.
      window.history.replaceState(null, "", `/receiving/${created.id}`);
    },
  });

  useUnsavedChangesWarning(draft.dirty && !locked);

  /** What the API expects; the backend works out every total itself. */
  const buildInput = useCallback((): PurchaseInput | null => {
    if (!supplierId || items.length === 0) return null;
    return {
      supplier_id: supplierId,
      purchase_date: purchaseDate,
      invoice_no: invoiceNo.trim() || null,
      discount_amount: "0.00",
      tax_amount: "0.00",
      items: items.map((item) => ({
        medicine_id: item.medicine_id,
        quantity_invoiced: Number(item.quantity_invoiced || 0),
        quantity_actual: item.quantity_actual === "" ? null : Number(item.quantity_actual),
        unit_cost: normalizeMoneyInput(item.unit_cost) ?? "0.00",
        lot_number: item.lot_number.trim(),
        expiry_date: item.expiry_date ?? "",
      })),
    };
  }, [supplierId, purchaseDate, invoiceNo, items]);

  /** Autosave fires on blur, never on every keystroke (C-2). */
  const handleBlur = useCallback(() => {
    if (locked) return;
    const input = buildInput();
    // The API rejects an item with no lot or expiry, so hold the draft back
    // until every line is at least structurally complete.
    if (input && input.items.every((item) => item.lot_number && item.expiry_date)) {
      draft.scheduleSave(input);
    }
  }, [buildInput, draft, locked]);

  useEffect(() => {
    if (isNew) return;
    let active = true;
    setLoading(true);
    getPurchase(id)
      .then((purchase) => {
        if (!active) return;
        setSupplierId(purchase.supplier_id);
        setInvoiceNo(purchase.invoice_no ?? "");
        setPurchaseDate(purchase.purchase_date);
        setLocked(purchase.status !== "draft");
        setItems(
          purchase.items.map((item) => ({
            key: nextKey(),
            medicine_id: item.medicine_id,
            medicine_name: item.medicine_name ?? "-",
            unit: "",
            lot_number: item.lot_number,
            expiry_date: item.expiry_date,
            expiryBlocking: false,
            quantity_invoiced: String(item.quantity_invoiced),
            quantity_actual: item.quantity_actual === null ? "" : String(item.quantity_actual),
            unit_cost: item.unit_cost,
          })),
        );
      })
      .catch((error: unknown) => {
        if (!active) return;
        setLoadError(error instanceof ApiError ? error.message : "โหลดใบรับสินค้าไม่สำเร็จ");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [id, isNew]);

  useEffect(() => {
    const controller = new AbortController();
    listSuppliers({ limit: 200, signal: controller.signal })
      .then((page) => setSuppliers(page.items))
      .catch(() => setSuppliers([]));
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (term.trim() === "") {
      setResults([]);
      return;
    }
    const controller = new AbortController();
    listMedicines({ q: term, limit: 10, signal: controller.signal })
      .then((page) => setResults(page.items))
      .catch((error: unknown) => {
        if (!isAbortError(error)) setResults([]);
      });
    return () => controller.abort();
  }, [term]);

  function addMedicine(medicine: Medicine) {
    setItems((current) => [
      ...current,
      {
        key: nextKey(),
        medicine_id: medicine.id,
        medicine_name: medicine.name,
        unit: medicine.unit,
        lot_number: "",
        expiry_date: null,
        expiryBlocking: false,
        quantity_invoiced: "",
        quantity_actual: "",
        unit_cost: "",
      },
    ]);
    setTerm("");
    setResults([]);
  }

  // Ctrl+S writes the draft immediately instead of waiting out the debounce.
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
        event.preventDefault();
        const input = buildInput();
        if (input && !locked) void draft.saveNow(input);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  });

  const blockers = useMemo(() => {
    const problems = items.flatMap((item) => itemProblems(item));
    if (!supplierId) problems.push("ยังไม่ได้เลือกผู้จำหน่าย");
    if (!invoiceNo.trim()) problems.push("ยังไม่ได้กรอกเลขที่ใบส่งของ");
    if (items.length === 0) problems.push("ยังไม่มีรายการ");
    return problems;
  }, [items, supplierId, invoiceNo]);

  const estimatedTotal = sumMoney(
    items.map((item) =>
      isValidMoney(item.unit_cost) && /^\d+$/.test(item.quantity_actual)
        ? multiplyMoney(item.unit_cost, Number(item.quantity_actual))
        : null,
    ),
  );
  const mismatchCount = items.filter((item) => itemDifference(item) !== 0).length;

  async function goToReview() {
    const input = buildInput();
    if (!input) return;
    // The draft must be written before step 2, so confirm works on saved data.
    const savedId = await draft.saveNow(input);
    if (savedId) setStep(2);
  }

  async function handleConfirm() {
    if (!purchaseId) return;
    setConfirming(true);
    setConfirmError(null);
    try {
      setResult(await confirmPurchase(purchaseId));
      setLocked(true);
    } catch (error) {
      setConfirmError(
        error instanceof ApiError ? error.message : "ยืนยันรับสินค้าไม่สำเร็จ ยังไม่มีการรับเข้าคลัง",
      );
    } finally {
      setConfirming(false);
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

  if (result) {
    return (
      <div className="space-y-4">
        <PageHeader title="รับสินค้าเรียบร้อย" />
        <div className="space-y-2 rounded-lg border border-green-200 bg-green-50 px-4 py-3">
          <p className="text-sm font-medium text-green-900">
            ✅ รับเข้าคลังแล้ว · เลขที่ใบรับ {result.purchase_no}
          </p>
          {result.status === "discrepancy" ? (
            <p className="text-sm text-amber-800">
              ⚠️ มี {result.discrepancies.length} รายการที่จำนวนไม่ตรงกับใบส่งของ —
              ใบรับนี้ถูกบันทึกเป็น &ldquo;จำนวนไม่ตรง&rdquo;
            </p>
          ) : null}
          <p className="text-sm text-green-900">สร้างล็อตใหม่ {result.lots.length} ล็อต</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            onClick={() => window.open(`/print/purchase/${result.purchase_id}`, "_blank", "noopener")}
          >
            🖨 พิมพ์ใบรับสินค้า {result.purchase_no}
          </Button>
          <Button type="button" variant="outline" onClick={() => router.push("/receiving")}>
            กลับไปหน้ารับสินค้า
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title={step === 1 ? "รับสินค้า — ขั้นที่ 1 ตามใบส่งของ" : "รับสินค้า — ขั้นที่ 2 ตรวจสอบ"}
        description={
          step === 1 ? "กรอกตามใบส่งของ แล้วนับของจริงในช่องถัดไป" : undefined
        }
        action={<DraftStatus state={draft.state} savedAt={draft.savedAt} error={draft.error} onRetry={handleBlur} />}
      />

      {loadError ? <ErrorState message={loadError} /> : null}
      {confirmError ? <ErrorState message={confirmError} /> : null}

      {locked && !result ? (
        <div className="rounded-lg border border-slate-300 bg-slate-50 px-4 py-3">
          <p className="text-sm text-slate-700">
            ใบนี้ยืนยันไปแล้ว แก้ไขไม่ได้ — ต้องใช้การปรับ Stock แทน
          </p>
        </div>
      ) : null}

      {loading ? (
        <p className="text-sm text-slate-500">กำลังโหลด...</p>
      ) : step === 2 ? (
        <ReviewStep
          items={items}
          invoiceNo={invoiceNo}
          supplierName={suppliers.find((s) => s.id === supplierId)?.name ?? null}
          confirming={confirming}
          onBack={() => setStep(1)}
          onConfirm={() => void handleConfirm()}
        />
      ) : (
        <>
          <Card>
            <CardContent className="grid gap-3 pt-5 sm:grid-cols-3">
              <div>
                <Label htmlFor="supplier">ผู้จำหน่าย *</Label>
                <select
                  id="supplier"
                  value={supplierId}
                  disabled={locked}
                  onChange={(event) => setSupplierId(event.target.value)}
                  onBlur={handleBlur}
                  className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-base md:text-sm"
                >
                  <option value="">— เลือกผู้จำหน่าย —</option>
                  {suppliers.map((supplier) => (
                    <option key={supplier.id} value={supplier.id}>
                      {supplier.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <Label htmlFor="invoice-no">เลขที่ใบส่งของ *</Label>
                <Input
                  id="invoice-no"
                  value={invoiceNo}
                  disabled={locked}
                  aria-invalid={!invoiceNo.trim()}
                  onChange={(event) => setInvoiceNo(event.target.value)}
                  onBlur={handleBlur}
                />
              </div>

              <div>
                <Label htmlFor="purchase-date">วันที่รับ</Label>
                <Input
                  id="purchase-date"
                  type="date"
                  value={purchaseDate}
                  disabled={locked}
                  onChange={(event) => setPurchaseDate(event.target.value)}
                  onBlur={handleBlur}
                />
                <p className="mt-1 text-xs text-slate-500">{formatDateBE(purchaseDate)}</p>
              </div>
            </CardContent>
          </Card>

          {!locked ? (
            <div className="space-y-2">
              <MedicineSearchInput value={term} onDebouncedChange={setTerm} label="เพิ่มยาเข้าใบรับ" />
              {results.length > 0 ? (
                <ul className="max-h-60 max-w-sm overflow-y-auto rounded-lg border border-slate-200 bg-white">
                  {results.map((medicine) => (
                    <li key={medicine.id}>
                      <button
                        type="button"
                        onClick={() => addMedicine(medicine)}
                        className="w-full px-3 py-2 text-left text-sm hover:bg-slate-50"
                      >
                        {medicine.name}
                        <span className="ml-2 text-xs text-slate-500">
                          {[medicine.strength, medicine.dosage_form].filter(Boolean).join(" · ")}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          ) : null}

          <div className="space-y-3" onBlur={handleBlur}>
            {items.map((item) => (
              <PurchaseItemCard
                key={item.key}
                item={item}
                disabled={locked}
                onChange={(changes) =>
                  setItems((current) =>
                    current.map((entry) =>
                      entry.key === item.key ? { ...entry, ...changes } : entry,
                    ),
                  )
                }
                onRemove={() =>
                  setItems((current) => current.filter((entry) => entry.key !== item.key))
                }
              />
            ))}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white px-4 py-3">
            <div className="text-sm text-slate-600">
              รวม {items.length} รายการ · มูลค่ารวม{" "}
              <MoneyText value={estimatedTotal} withUnit className="font-medium text-slate-900" />
              {mismatchCount > 0 ? (
                <span className="ml-2 text-amber-700">
                  ⚠️ มี {mismatchCount} รายการที่จำนวนไม่ตรงกับใบส่งของ
                </span>
              ) : null}
            </div>
            <Button
              type="button"
              onClick={() => void goToReview()}
              disabled={locked || blockers.length > 0 || draft.state === "saving"}
            >
              ตรวจสอบและยืนยัน →
            </Button>
          </div>

          {blockers.length > 0 && items.length > 0 ? (
            <div className="space-y-1 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
              {[...new Set(blockers)].map((problem) => (
                <p key={problem} className="text-xs text-amber-800">
                  • {problem}
                </p>
              ))}
            </div>
          ) : null}

          <p className="text-xs text-slate-500">กด Ctrl+S เพื่อบันทึกร่างทันที</p>
        </>
      )}
    </div>
  );
}
