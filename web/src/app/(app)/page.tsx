"use client";

import { useCallback, useEffect, useState } from "react";

import { useAuth } from "@/components/auth-provider";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ApiError, fetchHealth } from "@/lib/api";
import { roleLabel } from "@/lib/roles";

type HealthState =
  | { kind: "loading" }
  | { kind: "ok"; database: string }
  | { kind: "error"; message: string };

export default function HomePage() {
  const { me, profileError } = useAuth();
  const [health, setHealth] = useState<HealthState>({ kind: "loading" });

  const checkHealth = useCallback(async () => {
    setHealth({ kind: "loading" });
    try {
      const result = await fetchHealth();
      setHealth({ kind: "ok", database: result.database });
    } catch (error) {
      setHealth({
        kind: "error",
        message: error instanceof ApiError ? error.message : "เชื่อมต่อระบบไม่ได้",
      });
    }
  }, []);

  useEffect(() => {
    void checkHealth();
  }, [checkHealth]);

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
            {health.kind === "loading" ? <p className="text-slate-500">กำลังตรวจสอบ...</p> : null}
            {health.kind === "ok" ? (
              <p className="font-medium text-emerald-700">
                ปกติ · ฐานข้อมูล: {health.database === "ok" ? "เชื่อมต่อได้" : health.database}
              </p>
            ) : null}
            {health.kind === "error" ? (
              <Alert variant="destructive" role="alert">
                <AlertDescription>{health.message}</AlertDescription>
              </Alert>
            ) : null}
            <Button variant="outline" size="sm" onClick={() => void checkHealth()}>
              ตรวจสอบอีกครั้ง
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
