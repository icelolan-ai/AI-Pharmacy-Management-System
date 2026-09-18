"use client";

import { use, useCallback, useEffect, useState } from "react";
import Link from "next/link";

import { useAuth } from "@/components/auth-provider";
import { ErrorState } from "@/components/common/ErrorState";
import { SaleReceipt } from "@/components/print/SaleReceipt";
import { Button } from "@/components/ui/button";
import { ApiError } from "@/lib/api/client";
import { getSale, type Sale } from "@/lib/api/sales";
import { getStoreProfile, isStoreProfileEmpty, type StoreProfile } from "@/lib/api/store";
import { ABILITIES, can } from "@/lib/abilities";
import { formatDateBE, todayBangkokISO } from "@/lib/format/date";

/** The printable receipt, opened in its own tab. Every role may print.
 *  It fetches the shop profile itself — StoreProvider lives in the app layout
 *  and this tab is outside it. */
export default function PrintSalePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ copy?: string }>;
}) {
  const { id } = use(params);
  const { copy } = use(searchParams);
  const { me, session } = useAuth();
  const isCopy = copy === "1";

  const [sale, setSale] = useState<Sale | null>(null);
  const [store, setStore] = useState<StoreProfile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!session) return;
    setLoading(true);
    setError(null);
    try {
      const [saleResult, storeResult] = await Promise.all([getSale(id), getStoreProfile()]);
      setSale(saleResult);
      setStore(storeResult);
    } catch (loadError) {
      setSale(null);
      setError(loadError instanceof ApiError ? loadError.message : "โหลดใบเสร็จไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  }, [id, session]);

  useEffect(() => {
    void load();
  }, [load]);

  const storeMissing = !loading && !error && isStoreProfileEmpty(store);

  return (
    <main className="mx-auto max-w-2xl p-4 print:p-0">
      {/* Everything in here is screen-only; the paper gets the receipt alone. */}
      <div className="no-print space-y-3">
        {error ? <ErrorState message={error} onRetry={() => void load()} retrying={loading} /> : null}

        {storeMissing ? (
          <div className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3">
            <p className="text-sm font-medium text-amber-900">
              ยังไม่ได้ตั้งค่าข้อมูลร้าน — ใบเสร็จจะไม่มีหัวกระดาษ
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

        {sale ? (
          <div className="flex flex-wrap items-center gap-3">
            <Button type="button" onClick={() => window.print()}>
              🖨 พิมพ์
            </Button>
            <p className="text-xs text-slate-500">
              หากเอกสารมี URL ติดมาด้วย ให้ปิด &ldquo;หัวกระดาษและท้ายกระดาษ&rdquo; ในหน้าต่างพิมพ์
            </p>
          </div>
        ) : null}

        {loading ? <p className="text-sm text-slate-500">กำลังเตรียมใบเสร็จ...</p> : null}
      </div>

      {sale ? (
        <SaleReceipt
          sale={sale}
          store={store}
          copy={isCopy}
          copyDateText={formatDateBE(todayBangkokISO())}
        />
      ) : null}
    </main>
  );
}
