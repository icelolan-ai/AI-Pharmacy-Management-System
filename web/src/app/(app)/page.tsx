"use client";

import Link from "next/link";
import { Boxes, CalendarClock, Camera, PackagePlus, ShoppingCart, type LucideIcon } from "lucide-react";

import { useAuth } from "@/components/auth-provider";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { fetchHealth } from "@/lib/api/client";
import { listScans } from "@/lib/api/invoice-scans";
import { listExpiringReport } from "@/lib/api/reports";
import { formatTodayLongBE } from "@/lib/format/date";
import { greeting, lotsWithin90Days, openScanCount, summaryCardsFor } from "@/lib/home-summary";
import { setLargeTitle } from "@/lib/nav/large-title";
import { visibleHomeTasks } from "@/lib/nav/tabs";
import { roleLabel } from "@/lib/roles";
import { useSection } from "@/lib/use-section";

/** D78: on a phone, the home page is the day's jobs as big buttons — only
 *  the ones this person may do, from the menu's own permission filter. The
 *  connection is shown only when it is broken; who is signed in is in ☰.
 *  A wide screen keeps the cards below exactly as before. */
const TASK_ICONS: Record<string, LucideIcon> = {
  "/sell": ShoppingCart,
  "/scan": Camera,
  "/receiving": PackagePlus,
  "/expiry": CalendarClock,
  "/stock": Boxes,
};

export default function HomePage() {
  const { me, profileError } = useAuth();
  const health = useSection((signal) => fetchHealth(signal), {
    errorMessage: "เชื่อมต่อระบบไม่ได้",
  });
  // D82: each card asks for its number only if this person may see it.
  const cards = summaryCardsFor(me?.role);
  const expiring = useSection((signal) => listExpiringReport({ limit: 1, signal }), {
    enabled: cards.expiring,
    errorMessage: "โหลดตัวเลขไม่สำเร็จ",
  });
  const scans = useSection((signal) => listScans(signal), {
    enabled: cards.scans,
    errorMessage: "โหลดตัวเลขไม่สำเร็จ",
  });

  return (
    <>
      <div className="page-stack sm:hidden">
        {/* D82: a short greeting and today's date, as the page's large title. */}
        <div>
          <h1 ref={setLargeTitle} className="large-title">
            {greeting(me?.full_name)}
          </h1>
          <p className="text-sm text-slate-600">{formatTodayLongBE()}</p>
        </div>
        {profileError ? (
          <Alert variant="destructive" role="alert">
            <AlertDescription>{profileError}</AlertDescription>
          </Alert>
        ) : null}
        {health.error ? (
          <Alert variant="destructive" role="alert">
            <AlertDescription>
              {health.error}{" "}
              <button type="button" onClick={health.reload} className="font-semibold underline">
                ลองอีกครั้ง
              </button>
            </AlertDescription>
          </Alert>
        ) : null}
        {cards.expiring || cards.scans ? (
          <section aria-label="สรุปวันนี้" className="grid gap-3">
            {cards.expiring ? (
              <Link href="/expiry" transitionTypes={["nav-forward"]} className="hero-card block min-h-11">
                <p className="hero-sub">ล็อตที่ต้องดูภายใน 90 วัน</p>
                <p className="hero-number mt-1">
                  {expiring.data ? lotsWithin90Days(expiring.data.summary) : "—"}
                </p>
                <p className="hero-sub mt-2">
                  {expiring.error
                    ? expiring.error
                    : expiring.data
                      ? `🔴 วิกฤต ${expiring.data.summary.critical?.lot_count ?? 0} · 🟠 เสี่ยงสูง ${expiring.data.summary.high_risk?.lot_count ?? 0}`
                      : "กำลังโหลด…"}
                </p>
              </Link>
            ) : null}
            {cards.scans ? (
              <Link href="/scan" transitionTypes={["nav-forward"]} className="hero-card-light block min-h-11">
                <p className="text-sm text-slate-600">ใบส่งของที่ถ่ายไว้ ยังไม่ได้รับเข้า</p>
                <p className="hero-number mt-1 text-slate-900">{scans.data ? openScanCount(scans.data) : "—"}</p>
                {scans.error ? <p className="mt-2 text-sm text-slate-600">{scans.error}</p> : null}
              </Link>
            ) : null}
          </section>
        ) : null}

        <ul className="home-tasks">
          {visibleHomeTasks(me?.role).map((task) => {
            const Icon = TASK_ICONS[task.href] ?? Boxes;
            return (
              <li key={task.href} className="flex">
                <Link
                  href={task.href}
                  transitionTypes={["nav-forward"]}
                  className="home-task hero-card-light flex flex-1 flex-col items-center justify-center gap-3 p-4 text-center text-lg font-semibold text-slate-900 active:bg-slate-50"
                >
                  <span aria-hidden="true" className="list-row-icon size-14">
                    <Icon className="size-8" />
                  </span>
                  {task.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </div>

    <div className="hidden space-y-4 sm:block">
      <div>
        <h1 className="text-xl font-semibold">หน้าแรก</h1>
        <p className="text-sm text-slate-600">ระบบบริหารจัดการร้านขายยา</p>
      </div>

      {profileError ? (
        <Alert variant="destructive" role="alert">
          <AlertDescription>{profileError}</AlertDescription>
        </Alert>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">ผู้ใช้ปัจจุบัน</CardTitle>
            <CardDescription>ข้อมูลผู้ที่เข้าสู่ระบบอยู่</CardDescription>
          </CardHeader>
          <CardContent className="space-y-1 text-sm">
            <p>
              <span className="text-slate-500">ชื่อ: </span>
              {me?.full_name ?? "-"}
            </p>
            <p>
              <span className="text-slate-500">สิทธิ์: </span>
              {me ? roleLabel(me.role) : "-"}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">สถานะการเชื่อมต่อระบบ</CardTitle>
            <CardDescription>ตรวจการเชื่อมต่อกับเซิร์ฟเวอร์และฐานข้อมูล</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            {health.loading ? <p className="text-slate-500">กำลังตรวจสอบ...</p> : null}
            {!health.loading && health.data ? (
              <p className="font-medium text-emerald-700">
                ปกติ · ฐานข้อมูล:{" "}
                {health.data.database === "ok" ? "เชื่อมต่อได้" : health.data.database}
              </p>
            ) : null}
            {health.error ? (
              <Alert variant="destructive" role="alert">
                <AlertDescription>{health.error}</AlertDescription>
              </Alert>
            ) : null}
            <Button variant="outline" size="sm" onClick={health.reload}>
              ตรวจสอบอีกครั้ง
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
    </>
  );
}
