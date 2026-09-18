"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { useAuth } from "@/components/auth-provider";
import { EmptyState } from "@/components/common/EmptyState";
import { ErrorState } from "@/components/common/ErrorState";
import { MoneyText } from "@/components/common/MoneyText";
import { PageHeader } from "@/components/common/PageHeader";
import { CartItemCard } from "@/components/sell/CartItemCard";
import { ConfirmSaleDialog } from "@/components/sell/ConfirmSaleDialog";
import { SaleSuccessBanner } from "@/components/sell/SaleSuccessBanner";
import { SellSearchBar, toSearchResult, type SearchResult } from "@/components/sell/SellSearchBar";
import { Button } from "@/components/ui/button";
import { ApiError, isAbortError } from "@/lib/api/client";
import { getMedicineByBarcode, listMedicines, type Medicine } from "@/lib/api/medicines";
import { createSaleWithLots, parseShortages, type Sale } from "@/lib/api/sales";
import { ABILITIES, can } from "@/lib/abilities";
import { looksLikeBarcode } from "@/lib/format/number";
import { useUnsavedChangesWarning } from "@/lib/use-unsaved-changes-warning";
import { useSellCart } from "@/lib/hooks/use-sell-cart";

const SEARCH_DEBOUNCE_MS = 250;
const SLOW_SAVE_MS = 5000;

export default function SellPage() {
  const { me } = useAuth();
  const canSeePrice = can(me?.role, ABILITIES.viewCost);

  const cart = useSellCart();
  const [term, setTerm] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [highlight, setHighlight] = useState(0);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [slow, setSlow] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [sale, setSale] = useState<Sale | null>(null);
  const [printing, setPrinting] = useState(false);

  const searchRef = useRef<HTMLInputElement>(null);
  const searchAbort = useRef<AbortController | null>(null);
  const savingRef = useRef(false);

  const focusSearch = useCallback(() => {
    searchRef.current?.focus();
    searchRef.current?.select();
  }, []);

  // Rule 1: the cursor belongs in the search box, on load and after every action.
  useEffect(() => {
    focusSearch();
  }, [focusSearch]);

  // Rule 14: never lose a basket to a stray tab close.
  useUnsavedChangesWarning(cart.items.length > 0 && !saving);

  const runSearch = useCallback(async (text: string) => {
    searchAbort.current?.abort();
    const controller = new AbortController();
    searchAbort.current = controller;
    setSearching(true);
    setSearchError(null);
    try {
      const page = await listMedicines({ q: text, limit: 20, signal: controller.signal });
      if (controller.signal.aborted) return;
      setResults(page.items.map(toSearchResult));
      setHighlight(0);
    } catch (error) {
      if (isAbortError(error) || controller.signal.aborted) return;
      setResults([]);
      setSearchError(error instanceof ApiError ? error.message : "ค้นหายาไม่สำเร็จ");
    } finally {
      if (!controller.signal.aborted) setSearching(false);
    }
  }, []);

  useEffect(() => {
    const text = term.trim();
    if (text === "") {
      setResults([]);
      return;
    }
    const timer = setTimeout(() => void runSearch(text), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [term, runSearch]);

  // Rule 6: in stock first, then by name.
  const sortedResults = useMemo(() => {
    return [...results].sort(
      (a, b) =>
        Number(!a.sellable) - Number(!b.sellable) || a.name.localeCompare(b.name, "th"),
    );
  }, [results]);

  // Rule 4: same name, different strengths — say so, never guess.
  const ambiguousName = useMemo(() => {
    const byName = new Map<string, Set<string>>();
    for (const result of sortedResults) {
      const strengths = byName.get(result.name) ?? new Set<string>();
      strengths.add(result.strength ?? "");
      byName.set(result.name, strengths);
    }
    for (const [name, strengths] of byName) {
      if (strengths.size > 1) return name;
    }
    return null;
  }, [sortedResults]);

  function addToCart(medicine: Medicine, quantity = 1) {
    setSale(null);
    setSaveError(null);
    cart.addMedicine(medicine, quantity);
    setTerm("");
    setResults([]);
    focusSearch();
  }

  /** Enter in the search box: a barcode adds straight away, a name does not. */
  async function handleSubmit() {
    const text = term.trim();
    if (text === "") return;

    if (looksLikeBarcode(text)) {
      try {
        const medicine = await getMedicineByBarcode(text);
        const result = toSearchResult(medicine);
        if (!result.sellable) {
          setSearchError(`${medicine.name} ${result.reason}`);
          return;
        }
        addToCart(medicine, 1); // rule 2
        return;
      } catch {
        // 404 -> fall through to the normal search (rule: barcode then ?q=)
      }
    }

    await runSearch(text);
    // Rule 3: only an unambiguous single hit may be taken automatically.
    setResults((current) => {
      if (current.length === 1 && current[0].sellable && looksLikeBarcode(text)) {
        addToCart(current[0], 1);
        return [];
      }
      return current;
    });
  }

  const openConfirm = useCallback(() => {
    if (cart.canConfirm && !saving) setConfirmOpen(true);
  }, [cart.canConfirm, saving]);

  // Shortcuts (C-1). No F1.
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      const typing =
        target?.tagName === "INPUT" ||
        target?.tagName === "TEXTAREA" ||
        target?.isContentEditable;

      if (event.key === "F2" || (event.ctrlKey && event.key === "Enter")) {
        event.preventDefault();
        openConfirm();
      } else if (event.key === "/" && !typing) {
        event.preventDefault();
        focusSearch();
      } else if (event.key === "Escape" && !confirmOpen && cart.items.length > 0) {
        if (window.confirm("ล้างรายการทั้งหมดในตะกร้าหรือไม่?")) {
          cart.clear();
          focusSearch();
        }
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  });

  async function confirmSale() {
    if (savingRef.current) return; // rule: five fast clicks make one bill
    savingRef.current = true;
    setSaving(true);
    setSaveError(null);
    const slowTimer = setTimeout(() => setSlow(true), SLOW_SAVE_MS);

    try {
      const saved = await createSaleWithLots({
        items: cart.items.map((item) => ({
          medicine_id: item.medicine.id,
          quantity: item.quantity,
        })),
      });
      setSale(saved);
      cart.clear();
      setConfirmOpen(false);
      focusSearch();
    } catch (error) {
      if (error instanceof ApiError && error.code === "INSUFFICIENT_STOCK") {
        const shortages = parseShortages(error.details);
        cart.applyShortages(shortages);
        setSaveError(error.message);
        setConfirmOpen(false);
        // Rule 18: point at the card that is short.
        const first = shortages[0];
        if (first) {
          document
            .querySelector(`[data-medicine-id="${first.medicine_id}"]`)
            ?.scrollIntoView({ behavior: "smooth", block: "center" });
        }
      } else {
        // Rule 17: the exact words matter — nothing was deducted.
        setSaveError("บันทึกการขายไม่สำเร็จ ยังไม่มีการตัดสต็อก กรุณาลองใหม่");
      }
    } finally {
      clearTimeout(slowTimer);
      setSlow(false);
      setSaving(false);
      savingRef.current = false;
    }
  }

  function printReceipt() {
    if (!sale) return;
    setPrinting(true);
    // Never prints by itself: this only runs from the button.
    window.open(`/print/sale/${sale.id}`, "_blank", "noopener");
    setTimeout(() => setPrinting(false), 1000);
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="ขายยา"
        description="ยิงบาร์โค้ดหรือพิมพ์ชื่อยา แล้วกด F2 หรือ Ctrl+Enter เพื่อยืนยัน"
      />

      {sale ? (
        <SaleSuccessBanner
          sale={sale}
          printing={printing}
          onPrint={printReceipt}
          canSeePrice={canSeePrice}
        />
      ) : null}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="space-y-3">
          <SellSearchBar
            ref={searchRef}
            value={term}
            onChange={setTerm}
            onSubmit={() => void handleSubmit()}
            results={sortedResults}
            highlightIndex={highlight}
            onHighlight={setHighlight}
            onPick={(medicine) => addToCart(medicine, 1)}
            searching={searching}
            ambiguousName={ambiguousName}
          />

          {searchError ? <ErrorState message={searchError} /> : null}
          {saveError ? <ErrorState message={saveError} /> : null}

          {cart.items.length === 0 ? (
            <EmptyState title="🔍 ยิงบาร์โค้ด หรือ พิมพ์ชื่อยาเพื่อเริ่มขาย" />
          ) : (
            <div className="space-y-3">
              {cart.items.map((item) => (
                <CartItemCard
                  key={item.key}
                  item={item}
                  focused={item.key === cart.lastTouchedKey}
                  canSeePrice={canSeePrice}
                  onQuantityChange={(quantity) => cart.setQuantity(item.key, quantity)}
                  onRemove={() => {
                    cart.removeItem(item.key);
                    focusSearch();
                  }}
                  onRetryPreview={() => cart.retryPreview(item.key)}
                />
              ))}
            </div>
          )}
        </div>

        <aside className="space-y-3 lg:sticky lg:top-4 lg:self-start">
          <div className="rounded-lg border border-slate-200 bg-white p-4">
            <div className="flex items-center justify-between">
              <span className="text-sm text-slate-600">ยอดโดยประมาณ</span>
              <MoneyText value={cart.estimatedTotal} withUnit className="text-lg font-semibold" />
            </div>
            <p className="mt-1 text-xs text-slate-500">
              {cart.items.length} รายการ · ยอดจริงคิดจากระบบหลังบันทึก
            </p>
            <Button
              type="button"
              className="mt-3 w-full"
              disabled={!cart.canConfirm || saving}
              onClick={openConfirm}
            >
              ยืนยันการขาย
            </Button>
            <p className="mt-2 text-center text-xs text-slate-500">กด F2 หรือ Ctrl+Enter</p>
            {cart.items.length > 0 && !cart.canConfirm ? (
              <p className="mt-2 text-xs text-amber-700">
                รอตรวจสอบล็อตของทุกรายการให้เสร็จก่อนจึงจะยืนยันได้
              </p>
            ) : null}
          </div>
        </aside>
      </div>

      <ConfirmSaleDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        items={cart.items}
        estimatedTotal={cart.estimatedTotal}
        canSeePrice={canSeePrice}
        saving={saving}
        slow={slow}
        error={saveError}
        onConfirm={() => void confirmSale()}
      />
    </div>
  );
}
