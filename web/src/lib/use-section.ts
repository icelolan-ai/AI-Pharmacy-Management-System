"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { ApiError, isAbortError } from "@/lib/api/client";

export type Section<T> = {
  data: T | null;
  loading: boolean;
  error: string | null;
  /** Epoch ms of the last successful load — drives "อัปเดตล่าสุด". */
  loadedAt: number | null;
  reload: () => void;
};

type Settled<T> = {
  /** Which attempt and which inputs this result belongs to. */
  attempt: number;
  depsKey: string;
  data: T | null;
  error: string | null;
  loadedAt: number | null;
};

/** One independently loading piece of a page.
 *
 *  The dashboard fires several of these side by side: each renders as soon as
 *  it is ready, and one failing leaves the others alone with its own retry
 *  button (docs/05-web-spec.md 5.6).
 *
 *  `loading` is DERIVED — it is true while the latest attempt has not settled —
 *  so the effect never sets state synchronously, only from the promise's own
 *  callbacks. The previous data stays on screen while a reload is in flight.
 */
export function useSection<T>(
  fetcher: (signal: AbortSignal) => Promise<T>,
  {
    enabled = true,
    errorMessage,
    deps = [],
  }: {
    enabled?: boolean;
    errorMessage: string;
    /** Values the fetcher reads. Changing any of them loads again — the
     *  fetcher itself lives in a ref, so it cannot be a dependency. */
    deps?: readonly unknown[];
  },
): Section<T> {
  const [attempt, setAttempt] = useState(0);
  // One string standing for every input, so the effect list stays fixed-length.
  const depsKey = JSON.stringify(deps);
  const [settled, setSettled] = useState<Settled<T>>({
    attempt: -1,
    depsKey: "",
    data: null,
    error: null,
    loadedAt: null,
  });

  const fetcherRef = useRef(fetcher);
  useEffect(() => {
    fetcherRef.current = fetcher;
  });

  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();

    fetcherRef
      .current(controller.signal)
      .then((result) => {
        if (controller.signal.aborted) return;
        setSettled({ attempt, depsKey, data: result, error: null, loadedAt: Date.now() });
      })
      .catch((loadError: unknown) => {
        if (controller.signal.aborted || isAbortError(loadError)) return;
        setSettled({
          attempt,
          depsKey,
          data: null,
          error: loadError instanceof ApiError ? loadError.message : errorMessage,
          loadedAt: null,
        });
      });

    return () => controller.abort();
  }, [enabled, attempt, depsKey, errorMessage]);

  const reload = useCallback(() => setAttempt((value) => value + 1), []);

  const current = settled.attempt === attempt && settled.depsKey === depsKey;
  return {
    data: settled.data,
    error: current ? settled.error : null,
    loading: enabled && !current,
    loadedAt: settled.loadedAt,
    reload,
  };
}
