"use client";

import Link from "next/link";
import { Boxes, CalendarClock, Camera, PackagePlus, ShoppingCart, type LucideIcon } from "lucide-react";

import { useAuth } from "@/components/auth-provider";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { fetchHealth } from "@/lib/api/client";
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

  return (
    <>
      <div className="space-y-4 sm:hidden">
        <h1 className="sr-only">หน้าแรก</h1>
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
        <ul className="home-tasks">
          {visibleHomeTasks(me?.role).map((task) => {
            const Icon = TASK_ICONS[task.href] ?? Boxes;
            return (
              <li key={task.href} className="flex">
                <Link
                  href={task.href}
                  transitionTypes={["nav-forward"]}
                  className="home-task flex flex-1 flex-col items-center justify-center gap-3 rounded-2xl border border-slate-200 bg-white p-4 text-center text-lg font-semibold text-slate-900 shadow-sm active:bg-slate-50"
                >
                  <Icon aria-hidden="true" className="size-12 text-emerald-700" strokeWidth={2} />
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
