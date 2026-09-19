"use client";

import { use, useCallback, useEffect, useState } from "react";
import Link from "next/link";

import { useAuth } from "@/components/auth-provider";
import { ErrorState } from "@/components/common/ErrorState";
import { PurchaseNote } from "@/components/print/PurchaseNote";
import { Button } from "@/components/ui/button";
import { ApiError } from "@/lib/api/client";
import { getPurchase, type Purchase } from "@/lib/api/purchases";
import { getStoreProfile, isStoreProfileEmpty, type StoreProfile } from "@/lib/api/store";
import { ABILITIES, can } from "@/lib/abilities";

/** The printable goods-received note, in its own tab. It fetches the shop
 *  profile itself — StoreProvider lives in the app layout, not here — and
 *  always uses the current one (D21). */
export default function PrintPurchasePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { me, session } = useAuth();

  const [purchase, setPurchase] = useState<Purchase | null>(null);
  const [store, setStore] = useState<StoreProfile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!session) return;
    setLoading(true);
    setError(null);
    try {
      const [purchaseResult, storeResult] = await Promise.all([getPurchase(id), getStoreProfile()]);
      setPurchase(purchaseResult);
      setStore(storeResult);
    } catch (loadError) {
      setPurchase(null);
      setError(loadError instanceof ApiError ? loadError.message : "โหลดใบรับสินค้าไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  }, [id, session]);

  useEffect(() => {
    void load();
  }, [load]);

  const storeMissing = !loading && !error && isStoreProfileEmpty(store);
  const stillDraft = purchase?.status === "draft";

  return (
    <main className="mx-auto max-w-3xl p-4 print:p-0">
      <div className="no-print space-y-3">
        {error ? <ErrorState message={error} onRetry={() => void load()} retrying={loading} /> : null}

        {storeMissing ? (
          <div className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3">
            <p className="text-sm font-medium text-amber-900">
              ยังไม่ได้ตั้งค่าข้อมูลร้าน — ใบรับสินค้าจะไม่มีหัวกระดาษ
            </p>
            {can(me?.role, ABILITIES.manageStoreProfile) ? (
              <Link
                href="/settings/store"
                className="mt-1 inline-block text-sm text-amber-900 underline underline-offset-2"
              >
                ไปตั้งค่าข้อมูลร้าน
              </Link>
            ) : null}
          </div>
        ) : null}

        {stillDraft ? (
          <div className="rounded-lg border border-slate-300 bg-slate-50 px-4 py-3">
            <p className="text-sm text-slate-700">
              ใบนี้ยังเป็นร่าง ยังไม่มีเลขที่ใบรับ — ยืนยันรับเข้าคลังก่อนจึงจะพิมพ์ได้ครบ
            </p>
          </div>
        ) : null}

        {purchase ? (
          <div className="flex flex-wrap items-center gap-3">
            <Button type="button" onClick={() => window.print()}>
              🖨 พิมพ์
            </Button>
            <p className="text-xs text-slate-500">
              หากเอกสารมี URL ติดมาด้วย ให้ปิด &ldquo;หัวกระดาษและท้ายกระดาษ&rdquo; ในหน้าต่างพิมพ์
            </p>
          </div>
        ) : null}

        {loading ? <p className="text-sm text-slate-500">กำลังเตรียมใบรับสินค้า...</p> : null}
      </div>

      {purchase ? <PurchaseNote purchase={purchase} store={store} /> : null}
    </main>
  );
}
