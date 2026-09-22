"use client";

import { createContext, useCallback, useContext, useMemo, useState } from "react";

import { useAuth } from "@/components/auth-provider";
import { getStoreProfile, isStoreProfileEmpty, type StoreProfile } from "@/lib/api/store";
import { useSection } from "@/lib/use-section";

type StoreState = {
  store: StoreProfile | null;
  loading: boolean;
  error: string | null;
  /** True once loaded and still unsaved: screens that print it show the D21 notice. */
  isEmpty: boolean;
  reload: () => void;
  /** Put a freshly saved profile into the context without another request. */
  setStore: (store: StoreProfile) => void;
};

const StoreContext = createContext<StoreState | null>(null);

/** Holds ข้อมูลร้าน once per session so every receipt header reads the same data. */
export function StoreProvider({ children }: { children: React.ReactNode }) {
  const { session } = useAuth();

  const profile = useSection((signal) => getStoreProfile(signal), {
    enabled: Boolean(session),
    errorMessage: "โหลดข้อมูลร้านไม่สำเร็จ",
    deps: [Boolean(session)],
  });

  // A save puts the fresh profile straight into the context; until then the
  // loaded one stands.
  const [saved, setSaved] = useState<StoreProfile | null>(null);
  const store = saved ?? profile.data;

  const setStore = useCallback((next: StoreProfile) => setSaved(next), []);
  const reload = useCallback(() => {
    setSaved(null);
    profile.reload();
  }, [profile]);

  const value = useMemo<StoreState>(
    () => ({
      store,
      loading: profile.loading,
      error: profile.error,
      isEmpty: !profile.loading && !profile.error && isStoreProfileEmpty(store),
      reload,
      setStore,
    }),
    [store, profile.loading, profile.error, reload, setStore],
  );

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore(): StoreState {
  const context = useContext(StoreContext);
  if (!context) throw new Error("useStore must be used inside StoreProvider");
  return context;
}
