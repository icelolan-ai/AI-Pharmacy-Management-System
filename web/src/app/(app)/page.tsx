"use client";

import { useAuth } from "@/components/auth-provider";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { fetchHealth } from "@/lib/api/client";
import { roleLabel } from "@/lib/roles";
import { useSection } from "@/lib/use-section";

export default function HomePage() {
  const { me, profileError } = useAuth();
  const health = useSection((signal) => fetchHealth(signal), {
    errorMessage: "เชื่อมต่อระบบไม่ได้",
  });

  return (
    <div className="space-y-4">
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
  );
}
