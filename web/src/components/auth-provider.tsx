"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { Session } from "@supabase/supabase-js";

import { ApiError, fetchMe, isAbortError, type Me } from "@/lib/api/client";
import { supabase } from "@/lib/supabase";

type AuthState = {
  session: Session | null;
  me: Me | null;
  loading: boolean;
  profileLoading: boolean;
  profileError: string | null;
  signOut: () => Promise<void>;
  reloadProfile: () => Promise<void>;
};

const AuthContext = createContext<AuthState | null>(null);

/** What one finished /me call left behind, tagged with the request it answered
 *  so a late reply for a session the app has already left can be ignored. */
type Profile = {
  session: Session | null;
  attempt: number;
  me: Me | null;
  error: string | null;
};

const NOTHING_LOADED: Profile = { session: null, attempt: -1, me: null, error: null };

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  /** Bumped by the retry button; the only other reason to ask /me again. */
  const [attempt, setAttempt] = useState(0);
  const [profile, setProfile] = useState<Profile>(NOTHING_LOADED);

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
    });

    return () => {
      active = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  /** One /me per session and per retry, and never two at once: signing in as
   *  someone else, or pressing retry, aborts the call still on the wire, and an
   *  aborted call is not allowed to write. Losing that race would decide which
   *  user's role the menu is built from, so it is a permissions bug, not a
   *  cosmetic one. Nothing here feeds back into the dependencies below, so the
   *  result of a load can never ask for another one. */
  useEffect(() => {
    if (!session) return;
    const controller = new AbortController();

    fetchMe(controller.signal)
      .then((loaded) => {
        if (controller.signal.aborted) return;
        setProfile({ session, attempt, me: loaded, error: null });
      })
      .catch((loadError: unknown) => {
        if (controller.signal.aborted || isAbortError(loadError)) return;
        setProfile({
          session,
          attempt,
          me: null,
          error: loadError instanceof ApiError ? loadError.message : "โหลดข้อมูลผู้ใช้ไม่สำเร็จ",
        });
      });

    return () => controller.abort();
  }, [session, attempt]);

  const reloadProfile = useCallback(async () => {
    setAttempt((value) => value + 1);
  }, []);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    setSession(null);
  }, []);

  // Everything on screen follows the session and the last finished call rather
  // than being written alongside it, so signing out or signing in as someone
  // else cannot leave the previous user's name or role up for even one render.
  const sameUser =
    session !== null && profile.session !== null && profile.session.user.id === session.user.id;
  const me = sameUser ? profile.me : null;
  const profileError = sameUser ? profile.error : null;
  // A retry keeps its message on screen while it runs — only the button
  // changes — but a token refresh must not blank the user it re-reads.
  const profileLoading =
    session !== null && !(profile.session === session && profile.attempt === attempt);

  const value = useMemo<AuthState>(
    () => ({ session, me, loading, profileLoading, profileError, signOut, reloadProfile }),
    [session, me, loading, profileLoading, profileError, signOut, reloadProfile],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used inside AuthProvider");
  return context;
}
