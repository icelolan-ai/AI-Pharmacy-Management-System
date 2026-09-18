"use client";

import { useEffect, useState } from "react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ApiError, fetchMe, type Me } from "@/lib/api";
import { roleLabel } from "@/lib/roles";

export default function MePage() {
  const [me, setMe] = useState<Me | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      setMe(await fetchMe());
    } catch (err) {
      setMe(null);
      setError(err instanceof ApiError ? err.message : "โหลดข้อมูลไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold">ข้อมูลของฉัน</h1>
        <p className="text-sm text-slate-600">ข้อมูลผู้ใช้และสิทธิ์จากระบบหลังบ้าน</p>
      </div>

      <Card className="max-w-lg">
        <CardHeader>
          <CardTitle className="text-base">รายละเอียดบัญชี</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          {loading ? <p className="text-slate-500">กำลังโหลด...</p> : null}

          {error ? (
            <Alert variant="destructive" role="alert">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}

          {me ? (
            <dl className="grid grid-cols-[7rem_1fr] gap-y-2">
              <dt className="text-slate-500">ชื่อ</dt>
              <dd>{me.full_name ?? "-"}</dd>
              <dt className="text-slate-500">อีเมล</dt>
              <dd className="break-all">{me.email ?? "-"}</dd>
              <dt className="text-slate-500">สิทธิ์</dt>
              <dd>
                {roleLabel(me.role)} <span className="text-slate-400">({me.role})</span>
              </dd>
              <dt className="text-slate-500">รหัสผู้ใช้</dt>
              <dd className="break-all text-slate-500">{me.id}</dd>
            </dl>
          ) : null}

          <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
            โหลดใหม่
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
