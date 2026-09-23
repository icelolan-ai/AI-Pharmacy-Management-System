"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";

import { useAuth } from "@/components/auth-provider";
import { AppNav } from "@/components/nav/AppNav";
import { MobileNav } from "@/components/nav/MobileNav";
import { SideNavStoreName } from "@/components/store/SideNavStoreName";
import { Button } from "@/components/ui/button";
import { ABILITIES, type Ability } from "@/lib/abilities";
import { roleLabel } from "@/lib/roles";
import { StoreProvider } from "@/lib/store/store-provider";

const MENU: { href: string; label: string; ability?: Ability }[] = [
  { href: "/", label: "หน้าแรก" },
  { href: "/sell", label: "ขายยา" },
  { href: "/dashboard", label: "ภาพรวมร้าน", ability: ABILITIES.viewReports },
  { href: "/stock", label: "คลังยา" },
  { href: "/receiving", label: "รับสินค้า", ability: ABILITIES.receiveStock },
  { href: "/expiry", label: "ใกล้หมดอายุ", ability: ABILITIES.viewReports },
  { href: "/reports/expired", label: "หมดอายุแล้ว", ability: ABILITIES.viewReports },
  { href: "/reports/low-stock", label: "ยาใกล้หมด", ability: ABILITIES.viewReports },
  {
    href: "/reports/inventory-value",
    label: "มูลค่าคลังยา",
    ability: ABILITIES.viewInventoryValue,
  },
  { href: "/history/sales", label: "ประวัติการขาย", ability: ABILITIES.viewReports },
  { href: "/history/purchases", label: "ประวัติรับสินค้า", ability: ABILITIES.viewReports },
  { href: "/audit", label: "ตรวจสอบย้อนหลัง", ability: ABILITIES.viewAuditLog },
  { href: "/suppliers", label: "ผู้จำหน่าย", ability: ABILITIES.viewSuppliers },
  { href: "/me", label: "ข้อมูลของฉัน" },
  { href: "/settings/store", label: "ข้อมูลร้าน", ability: ABILITIES.manageStoreProfile },
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
    <StoreProvider>
      <div className="flex min-h-screen">
        <aside className="hidden w-56 shrink-0 border-r border-slate-200 bg-white p-4 sm:block">
          <SideNavStoreName />
          <AppNav items={MENU} role={me?.role} pathname={pathname} variant="sidebar" />
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="flex items-center justify-between gap-3 border-b border-slate-200 bg-white px-4 py-3">
            {/* The phone has no sidebar, so the way out of this page lives here. */}
            <MobileNav items={MENU} role={me?.role} pathname={pathname} />
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
    </StoreProvider>
  );
}
