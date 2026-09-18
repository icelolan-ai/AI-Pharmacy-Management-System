"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

import { useAuth } from "@/components/auth-provider";
import { ApiError } from "@/lib/api/client";
import { getStoreProfile, isStoreProfileEmpty, type StoreProfile } from "@/lib/api/store";

type StoreState = {
  store: StoreProfile | null;
  loading: boolean;
  error: string | null;
  /** True once loaded and still unsaved: screens that print it show the D21 notice. */
  isEmpty: boolean;
  reload: () => Promise<void>;
  /** Put a freshly saved profile into the context without another request. */
  setStore: (store: StoreProfile) => void;
};

const StoreContext = createContext<StoreState | null>(null);

/** Holds ข้อมูลร้าน once per session so every receipt header reads the same data. */
export function StoreProvider({ children }: { children: React.ReactNode }) {
  const { session } = useAuth();
  const [store, setStore] = useState<StoreProfile | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!session) return;
    setLoading(true);
    try {
      setStore(await getStoreProfile());
      setError(null);
    } catch (loadError) {
      setStore(null);
      setError(loadError instanceof ApiError ? loadError.message : "โหลดข้อมูลร้านไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  }, [session]);

  useEffect(() => {
    if (session) void reload();
    else setStore(null);
  }, [session, reload]);

  const value = useMemo<StoreState>(
    () => ({
      store,
      loading,
      error,
      isEmpty: !loading && !error && isStoreProfileEmpty(store),
      reload,
      setStore,
    }),
    [store, loading, error, reload],
  );

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore(): StoreState {
  const context = useContext(StoreContext);
  if (!context) throw new Error("useStore must be used inside StoreProvider");
  return context;
}
