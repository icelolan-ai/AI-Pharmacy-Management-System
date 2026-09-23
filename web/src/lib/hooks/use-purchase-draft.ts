"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { ApiError } from "@/lib/api/client";
import { createPurchase, updatePurchase, type Purchase, type PurchaseInput } from "@/lib/api/purchases";

export type SaveState = "idle" | "pending" | "saving" | "saved" | "error";

const DEBOUNCE_MS = 2000;

/** Autosaving a receiving draft (C-2).
 *
 *  Saves on blur, 2 seconds after the last edit. Requests are queued, never
 *  overlapped: while one PUT is in flight any further edits are held, and when
 *  it returns only the LATEST value is sent — one request, not a backlog.
 */
export function usePurchaseDraft({
  purchaseId,
  onCreated,
}: {
  purchaseId: string | null;
  onCreated: (purchase: Purchase) => void;
}) {
  const [state, setState] = useState<SaveState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  /** Which purchase the next save writes to. It follows the prop, and flush()
   *  fills it in itself the first time, when the draft is created. Synced
   *  after every render, not during one: nothing reads it while rendering, and
   *  every reader — the debounce timer, Ctrl+S, the step-2 button — runs long
   *  after the commit. */
  const idRef = useRef<string | null>(purchaseId);
  useEffect(() => {
    idRef.current = purchaseId;
  });

  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inFlight = useRef(false);
  /** The newest value waiting for its turn; only ever one. */
  const queued = useRef<PurchaseInput | null>(null);

  // Named so the follow-up below calls THIS function rather than the memoized
  // `flush` binding — the queue keeps working and the memoization survives.
  const flush = useCallback(async function flush(): Promise<void> {
    if (inFlight.current) return; // the queued value will go out when this one lands
    const input = queued.current;
    if (!input) return;

    queued.current = null;
    inFlight.current = true;
    setState("saving");
    setError(null);

    try {
      if (idRef.current) {
        await updatePurchase(idRef.current, input);
      } else {
        const created = await createPurchase(input);
        idRef.current = created.id;
        onCreated(created);
      }
      setState("saved");
      setSavedAt(Date.now());
    } catch (saveError) {
      setState("error");
      setError(saveError instanceof ApiError ? saveError.message : "บันทึกร่างไม่สำเร็จ");
    } finally {
      inFlight.current = false;
      // Anything typed while that request was out goes now, as one save.
      if (queued.current) void flush();
    }
  }, [onCreated]);

  /** Call on blur. The draft is written 2s later, or sooner via saveNow. */
  const scheduleSave = useCallback(
    (input: PurchaseInput) => {
      queued.current = input;
      setState("pending");
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => void flush(), DEBOUNCE_MS);
    },
    [flush],
  );

  /** Ctrl+S, and before moving to step 2: write what is pending right away. */
  const saveNow = useCallback(
    async (input?: PurchaseInput) => {
      if (input) queued.current = input;
      if (timer.current) clearTimeout(timer.current);
      await flush();
      // If a save was already running, flush() queued this one; wait for it.
      while (inFlight.current || queued.current) {
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
      return idRef.current;
    },
    [flush],
  );

  useEffect(() => {
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  return {
    state,
    error,
    savedAt,
    /** True while an edit is waiting or being written — used to warn on exit. */
    dirty: state === "pending" || state === "saving",
    scheduleSave,
    saveNow,
  };
}
