"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { Session } from "@supabase/supabase-js";

import { ApiError, fetchMe, type Me } from "@/lib/api";
import { supabase } from "@/lib/supabase";

type AuthState = {
  session: Session | null;
  me: Me | null;
  loading: boolean;
  profileError: string | null;
  signOut: () => Promise<void>;
  reloadProfile: () => Promise<void>;
};

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);
  const [profileError, setProfileError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      setSession(data.session);
      setLoading(false);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setLoading(false);
      if (!nextSession) {
        setMe(null);
        setProfileError(null);
      }
    });

    return () => {
      active = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  const reloadProfile = useCallback(async () => {
    if (!session) return;
    try {
      setMe(await fetchMe());
      setProfileError(null);
    } catch (error) {
      setMe(null);
      setProfileError(error instanceof ApiError ? error.message : "โหลดข้อมูลผู้ใช้ไม่สำเร็จ");
    }
  }, [session]);

  useEffect(() => {
    if (session) void reloadProfile();
  }, [session, reloadProfile]);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    setSession(null);
    setMe(null);
    setProfileError(null);
  }, []);

  const value = useMemo<AuthState>(
    () => ({ session, me, loading, profileError, signOut, reloadProfile }),
    [session, me, loading, profileError, signOut, reloadProfile],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used inside AuthProvider");
  return context;
}
