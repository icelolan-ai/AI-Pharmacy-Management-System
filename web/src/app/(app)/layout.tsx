"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";

import { useAuth } from "@/components/auth-provider";
import { AppNav } from "@/components/nav/AppNav";
import { MobileNav, MobileTopBar } from "@/components/nav/MobileNav";
import { PageSlide } from "@/components/nav/PageSlide";
import { SideNavStoreName } from "@/components/store/SideNavStoreName";
import { Button } from "@/components/ui/button";
import { MENU } from "@/lib/nav/menu";
import { routeFor } from "@/lib/nav/routes";
import { roleLabel } from "@/lib/roles";
import { StoreProvider, useStore } from "@/lib/store/store-provider";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { session, me, loading, profileLoading, profileError, signOut, reloadProfile } = useAuth();

  useEffect(() => {
    if (!loading && !session) router.replace("/login");
  }, [loading, session, router]);

  if (loading || !session) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <p className="text-sm text-slate-500">กำลังโหลด...</p>
      </main>
    );
  }

  return (
    <StoreProvider>
      <div className="flex min-h-screen">
        <aside className="hidden w-56 shrink-0 border-r border-slate-200 bg-white p-4 sm:block">
          <SideNavStoreName />
          <AppNav
            groups={MENU}
            role={me?.role}
            userId={me?.id}
            pathname={pathname}
            variant="sidebar"
          />
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          {/* D78: on a phone, ← and the page's name; the menu, the user and
              signing out are in the bottom bar's ☰. A wide screen keeps the
              header below exactly as it was. */}
          <PhoneTopBar pathname={pathname} />
          <header className="hidden flex-wrap items-center justify-between gap-x-3 gap-y-2 border-b border-slate-200 bg-white px-4 py-3 sm:flex">
            {me ? (
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-slate-900">
                  {me.full_name ?? me.email ?? "ผู้ใช้"}
                </p>
                <p className="text-xs text-slate-500">{roleLabel(me.role)}</p>
              </div>
            ) : profileError ? (
              // Loading the profile failed (e.g. the backend is down): say so instead of
              // showing "loading" forever, and offer a retry.
              <div className="flex min-w-0 items-center gap-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-slate-900">โหลดข้อมูลผู้ใช้ไม่ได้</p>
                  <p className="truncate text-xs text-slate-500">{profileError}</p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => void reloadProfile()}
                  disabled={profileLoading}
                >
                  {profileLoading ? "กำลังลองใหม่..." : "ลองใหม่"}
                </Button>
              </div>
            ) : (
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-slate-900">ผู้ใช้</p>
                <p className="text-xs text-slate-500">กำลังโหลดสิทธิ์...</p>
              </div>
            )}
            <Button variant="outline" size="sm" onClick={() => void signOut()}>
              ออกจากระบบ
            </Button>
          </header>

          {/* tab-bar-clearance: on a phone the page ends above the bottom
              bar, so a confirm button is never hidden under it. */}
          <main className="tab-bar-clearance page-gutter flex-1 py-4 sm:p-6">
            <PageSlide pathname={pathname}>{children}</PageSlide>
          </main>
        </div>
      </div>

      <MobileNav
        groups={MENU}
        role={me?.role}
        roleKnown={me != null}
        userId={me?.id}
        pathname={pathname}
        signed={{
          name: me ? (me.full_name ?? me.email ?? "ผู้ใช้") : null,
          role: me?.role,
          profileError,
          profileLoading,
          onRetry: () => void reloadProfile(),
          onSignOut: () => void signOut(),
        }}
      />
    </StoreProvider>
  );
}

/** Reads the shop's name, so it sits inside StoreProvider. */
function PhoneTopBar({ pathname }: { pathname: string }) {
  const { store } = useStore();
  const route = routeFor(pathname);
  const parent = route?.parent ? routeFor(route.parent) : null;
  const title = route?.parent === null ? (store?.name?.trim() || route.title) : (route?.title ?? "");
  return <MobileTopBar title={title} parent={parent ? { href: parent.pattern, title: parent.title } : null} />;
}
