"use client";

import { useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

import { useAuth } from "@/components/auth-provider";
import { Button } from "@/components/ui/button";
import { ABILITIES, can, type Ability } from "@/lib/abilities";
import { roleLabel } from "@/lib/roles";

const MENU: { href: string; label: string; ability?: Ability }[] = [
  { href: "/", label: "หน้าแรก" },
  { href: "/stock", label: "สต็อกยา" },
  { href: "/suppliers", label: "ผู้จำหน่าย", ability: ABILITIES.viewSuppliers },
  { href: "/me", label: "ข้อมูลของฉัน" },
];

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
    <div className="flex min-h-screen">
      <aside className="hidden w-56 shrink-0 border-r border-slate-200 bg-white p-4 sm:block">
        <div className="mb-6 text-sm font-semibold text-slate-900">ร้านขายยา</div>
        <nav className="space-y-1">
          {MENU.filter((item) => !item.ability || can(me?.role, item.ability)).map((item) => {
            const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={`block rounded-md px-3 py-2 text-sm ${
                  active ? "bg-slate-900 text-white" : "text-slate-700 hover:bg-slate-100"
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between gap-4 border-b border-slate-200 bg-white px-4 py-3">
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

        <main className="flex-1 p-4 sm:p-6">{children}</main>
      </div>
    </div>
  );
}
