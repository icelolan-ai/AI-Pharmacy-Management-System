"use client";

import { useAuth } from "@/components/auth-provider";
import { ErrorState } from "@/components/common/ErrorState";
import { PageHeader } from "@/components/common/PageHeader";
import { SkeletonTable } from "@/components/common/SkeletonTable";
import { StoreProfileForm } from "@/components/store/StoreProfileForm";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ABILITIES, can } from "@/lib/abilities";
import { useStore } from "@/lib/store/store-provider";

export default function StoreSettingsPage() {
  const { me } = useAuth();
  const { store, loading, error, isEmpty, reload, setStore } = useStore();
  const allowed = can(me?.role, ABILITIES.manageStoreProfile);

  if (me && !allowed) {
    return (
      <div className="space-y-4">
        <PageHeader title="ข้อมูลร้าน" />
        <ErrorState message="เฉพาะเจ้าของร้านเท่านั้นที่แก้ไขข้อมูลร้านได้" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="ข้อมูลร้าน"
        description="ชื่อ ที่อยู่ และเลขทะเบียนที่จะพิมพ์บนหัวใบเสร็จ"
      />

      <Alert>
        <AlertDescription>
          ข้อมูลนี้ใช้เป็นหัวใบเสร็จและหัวรายงานของร้าน (D21) การแก้ไขมีผลกับเอกสารที่ออกหลังจากนี้
          เท่านั้น เอกสารที่พิมพ์ไปแล้วจะไม่เปลี่ยนตาม
        </AlertDescription>
      </Alert>

      {isEmpty ? (
        <Alert>
          <AlertDescription>
            ยังไม่ได้บันทึกข้อมูลร้าน กรุณากรอกอย่างน้อย &ldquo;ชื่อร้าน&rdquo; แล้วกดบันทึก
          </AlertDescription>
        </Alert>
      ) : null}

      {error ? <ErrorState message={error} onRetry={() => void reload()} retrying={loading} /> : null}

      {loading ? <SkeletonTable rows={5} columns={2} /> : <StoreProfileForm profile={store} onSaved={setStore} />}
    </div>
  );
}
