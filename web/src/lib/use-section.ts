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

/** One independently loading piece of a page.
 *
 *  The dashboard fires several of these side by side: each renders as soon as
 *  it is ready, and one failing leaves the others alone with its own retry
 *  button (docs/05-web-spec.md 5.6).
 */
export function useSection<T>(
  fetcher: (signal: AbortSignal) => Promise<T>,
  { enabled = true, errorMessage }: { enabled?: boolean; errorMessage: string },
): Section<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState<string | null>(null);
  const [loadedAt, setLoadedAt] = useState<number | null>(null);
  const [attempt, setAttempt] = useState(0);
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  useEffect(() => {
    if (!enabled) {
      setLoading(false);
      return;
    }
    const controller = new AbortController();
    setLoading(true);
    setError(null);

    fetcherRef
      .current(controller.signal)
      .then((result) => {
        if (controller.signal.aborted) return;
        setData(result);
        setError(null);
        setLoadedAt(Date.now());
      })
      .catch((loadError: unknown) => {
        if (isAbortError(loadError) || controller.signal.aborted) return;
        setData(null);
        setError(loadError instanceof ApiError ? loadError.message : errorMessage);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [enabled, attempt, errorMessage]);

  const reload = useCallback(() => setAttempt((value) => value + 1), []);
  return { data, loading, error, loadedAt, reload };
}
