"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";

import { useAuth } from "@/components/auth-provider";
import { AppNav, type NavGroup } from "@/components/nav/AppNav";
import { MobileNav } from "@/components/nav/MobileNav";
import { SideNavStoreName } from "@/components/store/SideNavStoreName";
import { Button } from "@/components/ui/button";
import { ABILITIES } from "@/lib/abilities";
import { roleLabel } from "@/lib/roles";
import { StoreProvider } from "@/lib/store/store-provider";

/** The menu, in the order a shop actually works through its day (U-3).
 *
 *  The first block carries no heading and never folds: selling and looking
 *  something up in the stock list happen all day, and putting them behind a
 *  heading to read past would make the menu worse, not better.
 *
 *  "ยาที่ต้องดูด่วน" is deliberately not filed under reports. Those three
 *  pages are things to act on, not things to look at.
 */
const MENU: readonly NavGroup[] = [
  {
    heading: null,
    items: [
      { href: "/", label: "หน้าแรก" },
      { href: "/sell", label: "ขายยา" },
      { href: "/stock", label: "คลังยา" },
    ],
  },
  {
    heading: "หน้าที่ประจำวัน",
    items: [{ href: "/receiving", label: "รับสินค้า", ability: ABILITIES.receiveStock }],
  },
  {
    heading: "ยาที่ต้องดูด่วน",
    items: [
      { href: "/reports/low-stock", label: "ยาใกล้หมด", ability: ABILITIES.viewReports },
      { href: "/expiry", label: "ใกล้หมดอายุ", ability: ABILITIES.viewReports },
      { href: "/reports/expired", label: "หมดอายุแล้ว", ability: ABILITIES.viewReports },
    ],
  },
  {
    heading: "รายงานและประวัติ",
    items: [
      { href: "/dashboard", label: "ภาพรวมร้าน", ability: ABILITIES.viewReports },
      {
        href: "/reports/inventory-value",
        label: "มูลค่าคลังยา",
        ability: ABILITIES.viewInventoryValue,
      },
      { href: "/history/sales", label: "ประวัติการขาย", ability: ABILITIES.viewReports },
      { href: "/history/purchases", label: "ประวัติรับสินค้า", ability: ABILITIES.viewReports },
      { href: "/audit", label: "ตรวจสอบย้อนหลัง", ability: ABILITIES.viewAuditLog },
    ],
  },
  {
    heading: "ตั้งค่า",
    items: [
      { href: "/suppliers", label: "ผู้จำหน่าย", ability: ABILITIES.viewSuppliers },
      { href: "/settings/store", label: "ข้อมูลร้าน", ability: ABILITIES.manageStoreProfile },
      // U-8: ทุก role เปิดดูได้ พนักงานขายต้องหาว่ายาอยู่ตรงไหน
      { href: "/store-map", label: "ผังร้าน" },
      { href: "/me", label: "ข้อมูลของฉัน" },
    ],
  },
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
          <AppNav
            groups={MENU}
            role={me?.role}
            userId={me?.id}
            pathname={pathname}
            variant="sidebar"
          />
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-b border-slate-200 bg-white px-4 py-3">
            {/* The phone has no sidebar, so the way out of this page lives here. */}
            <MobileNav groups={MENU} role={me?.role} userId={me?.id} pathname={pathname} />
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
