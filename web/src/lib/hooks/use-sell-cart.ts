"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { ApiError } from "@/lib/api/client";
import type { Medicine } from "@/lib/api/medicines";
import { getFefoPreview, type FefoPreview } from "@/lib/api/sales";
import { addMoney, multiplyMoney } from "@/lib/format/money";

export type PreviewState = "idle" | "loading" | "ok" | "error";

export type CartItem = {
  key: string;
  medicine: Medicine;
  quantity: number;
  preview?: FefoPreview;
  previewState: PreviewState;
  errorMessage?: string;
  /** Set from an INSUFFICIENT_STOCK response so the card can point at itself. */
  shortage?: { requested: number; available: number };
};

const PREVIEW_DEBOUNCE_MS = 350;

/** The sell cart.
 *
 *  Every quantity change re-plans the lots that would be cut, debounced per
 *  item and cancelling only that item's previous request (C-4) — one slow
 *  medicine never blocks the rest of the basket.
 */
export function useSellCart() {
  const [items, setItems] = useState<CartItem[]>([]);
  const [lastTouchedKey, setLastTouchedKey] = useState<string | null>(null);

  // Per-item timers and abort controllers, so they never interfere.
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const controllers = useRef(new Map<string, AbortController>());

  const patch = useCallback((key: string, changes: Partial<CartItem>) => {
    setItems((current) =>
      current.map((item) => (item.key === key ? { ...item, ...changes } : item)),
    );
  }, []);

  const runPreview = useCallback(
    (key: string, medicineId: string, quantity: number) => {
      controllers.current.get(key)?.abort();
      const controller = new AbortController();
      controllers.current.set(key, controller);

      patch(key, { previewState: "loading", errorMessage: undefined });
      getFefoPreview(medicineId, quantity, controller.signal)
        .then((preview) => {
          if (controller.signal.aborted) return;
          patch(key, { preview, previewState: "ok", shortage: undefined });
        })
        .catch((error: unknown) => {
          if (controller.signal.aborted) return;
          patch(key, {
            previewState: "error",
            errorMessage:
              error instanceof ApiError ? error.message : "ตรวจสอบล็อตไม่สำเร็จ",
          });
        });
    },
    [patch],
  );

  const schedulePreview = useCallback(
    (key: string, medicineId: string, quantity: number) => {
      clearTimeout(timers.current.get(key));
      patch(key, { previewState: "loading" });
      timers.current.set(
        key,
        setTimeout(() => runPreview(key, medicineId, quantity), PREVIEW_DEBOUNCE_MS),
      );
    },
    [patch, runPreview],
  );

  /** Same medicine again adds to the existing card rather than making a new one. */
  const addMedicine = useCallback(
    (medicine: Medicine, quantity = 1) => {
      let key = medicine.id;
      let nextQuantity = quantity;
      setItems((current) => {
        const existing = current.find((item) => item.medicine.id === medicine.id);
        if (existing) {
          nextQuantity = existing.quantity + quantity;
          key = existing.key;
          return current.map((item) =>
            item.key === key ? { ...item, quantity: nextQuantity } : item,
          );
        }
        return [
          ...current,
          { key, medicine, quantity, previewState: "loading" as PreviewState },
        ];
      });
      setLastTouchedKey(key);
      schedulePreview(key, medicine.id, nextQuantity);
    },
    [schedulePreview],
  );

  const setQuantity = useCallback(
    (key: string, quantity: number) => {
      const item = items.find((entry) => entry.key === key);
      if (!item || quantity < 1) return;
      patch(key, { quantity, shortage: undefined });
      setLastTouchedKey(key);
      schedulePreview(key, item.medicine.id, quantity);
    },
    [items, patch, schedulePreview],
  );

  const removeItem = useCallback((key: string) => {
    clearTimeout(timers.current.get(key));
    controllers.current.get(key)?.abort();
    timers.current.delete(key);
    controllers.current.delete(key);
    setItems((current) => current.filter((item) => item.key !== key));
  }, []);

  const clear = useCallback(() => {
    for (const timer of timers.current.values()) clearTimeout(timer);
    for (const controller of controllers.current.values()) controller.abort();
    timers.current.clear();
    controllers.current.clear();
    setItems([]);
    setLastTouchedKey(null);
  }, []);

  const retryPreview = useCallback(
    (key: string) => {
      const item = items.find((entry) => entry.key === key);
      if (item) runPreview(key, item.medicine.id, item.quantity);
    },
    [items, runPreview],
  );

  /** Mark the cards the backend said were short of stock. */
  const applyShortages = useCallback(
    (shortages: { medicine_id: string; requested: number; available: number }[]) => {
      setItems((current) =>
        current.map((item) => {
          const shortage = shortages.find((entry) => entry.medicine_id === item.medicine.id);
          return shortage
            ? { ...item, shortage: { requested: shortage.requested, available: shortage.available } }
            : item;
        }),
      );
    },
    [],
  );

  useEffect(() => {
    const pendingTimers = timers.current;
    const pendingControllers = controllers.current;
    return () => {
      for (const timer of pendingTimers.values()) clearTimeout(timer);
      for (const controller of pendingControllers.values()) controller.abort();
    };
  }, []);

  // Estimate only — the backend's total is what gets stored and printed.
  const estimatedTotal = items.reduce(
    (total, item) =>
      item.medicine.selling_price
        ? addMoney(total, multiplyMoney(item.medicine.selling_price, item.quantity))
        : total,
    "0.00",
  );

  const everyPreviewReady =
    items.length > 0 &&
    items.every((item) => item.previewState === "ok" && item.preview?.sufficient);
  const hasShortage = items.some((item) => Boolean(item.shortage));

  return {
    items,
    lastTouchedKey,
    estimatedTotal,
    /** C-4: the confirm button stays disabled until every line has a good plan. */
    canConfirm: everyPreviewReady && !hasShortage,
    addMedicine,
    setQuantity,
    removeItem,
    clear,
    retryPreview,
    applyShortages,
  };
}
