"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { useAuth } from "@/components/auth-provider";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ApiError, fetchMe } from "@/lib/api/client";
import { isSupabaseConfigured, supabase } from "@/lib/supabase";

/** Turns Supabase auth errors into plain Thai, with no technical wording. */
function loginErrorMessage(rawMessage: string, status?: number): string {
  const message = rawMessage.toLowerCase();
  if (message.includes("invalid login credentials")) return "อีเมลหรือรหัสผ่านไม่ถูกต้อง";
  if (message.includes("email not confirmed")) return "บัญชีนี้ยังไม่ได้ยืนยันอีเมล กรุณาติดต่อเจ้าของร้าน";
  if (message.includes("too many requests") || status === 429)
    return "ลองเข้าสู่ระบบบ่อยเกินไป กรุณารอสักครู่แล้วลองใหม่";
  if (message.includes("failed to fetch") || message.includes("network") || message.includes("fetch"))
    return "เชื่อมต่อระบบไม่ได้ กรุณาตรวจสอบอินเทอร์เน็ตแล้วลองใหม่อีกครั้ง";
  return "เข้าสู่ระบบไม่สำเร็จ กรุณาลองใหม่อีกครั้ง";
}

export default function LoginPage() {
  const router = useRouter();
  const { session, loading } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!loading && session) router.replace("/");
  }, [loading, session, router]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (!isSupabaseConfigured) {
      setError("ยังไม่ได้ตั้งค่าการเชื่อมต่อระบบ กรุณาติดต่อผู้ดูแล");
      return;
    }

    setSubmitting(true);
    try {
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (signInError) {
        setError(loginErrorMessage(signInError.message, signInError.status));
        return;
      }

      // The account must also have a profile in the backend (spec 7.1).
      try {
        await fetchMe();
      } catch (profileError) {
        await supabase.auth.signOut();
        setError(
          profileError instanceof ApiError && profileError.status === 403
            ? profileError.message
            : "เข้าสู่ระบบได้ แต่โหลดข้อมูลผู้ใช้ไม่สำเร็จ กรุณาลองใหม่อีกครั้ง",
        );
        return;
      }

      router.replace("/");
    } catch {
      setError("เชื่อมต่อระบบไม่ได้ กรุณาตรวจสอบอินเทอร์เน็ตแล้วลองใหม่อีกครั้ง");
    } finally {
      setSubmitting(false);
      setPassword("");
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="text-xl">เข้าสู่ระบบ</CardTitle>
          <CardDescription>ระบบบริหารจัดการร้านขายยา</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4" noValidate>
            <div className="space-y-2">
              <Label htmlFor="email">อีเมล</Label>
              <Input
                id="email"
                type="email"
                autoComplete="username"
                required
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                disabled={submitting}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">รหัสผ่าน</Label>
              <Input
                id="password"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                disabled={submitting}
              />
            </div>

            {error ? (
              <Alert variant="destructive" role="alert">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            ) : null}

            <Button type="submit" className="w-full" disabled={submitting}>
              {submitting ? "กำลังเข้าสู่ระบบ..." : "เข้าสู่ระบบ"}
            </Button>
          </form>
          <p className="mt-4 text-center text-xs text-slate-500">
            ต้องการบัญชีใหม่ กรุณาติดต่อเจ้าของร้าน
          </p>
        </CardContent>
      </Card>
    </main>
  );
}
