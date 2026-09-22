"use client";

import { use } from "react";
import Link from "next/link";

import { useAuth } from "@/components/auth-provider";
import { ErrorState } from "@/components/common/ErrorState";
import { SaleReceipt } from "@/components/print/SaleReceipt";
import { Button } from "@/components/ui/button";
import { getSale, type Sale } from "@/lib/api/sales";
import { getStoreProfile, isStoreProfileEmpty, type StoreProfile } from "@/lib/api/store";
import { ABILITIES, can } from "@/lib/abilities";
import { formatDateBE, todayBangkokISO } from "@/lib/format/date";
import { useSection } from "@/lib/use-section";

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

  const receipt = useSection(
    async (signal) => {
      const [saleResult, storeResult] = await Promise.all([
        getSale(id, signal),
        getStoreProfile(signal),
      ]);
      return { sale: saleResult, store: storeResult };
    },
    { enabled: Boolean(session), errorMessage: "โหลดใบเสร็จไม่สำเร็จ", deps: [id] },
  );
  const sale = receipt.data?.sale ?? null;
  const store = receipt.data?.store ?? null;
  const { error, loading } = receipt;

  const storeMissing = !loading && !error && isStoreProfileEmpty(store);

  return (
    <main className="mx-auto max-w-2xl p-4 print:p-0">
      {/* Everything in here is screen-only; the paper gets the receipt alone. */}
      <div className="no-print space-y-3">
        {error ? <ErrorState message={error} onRetry={receipt.reload} retrying={loading} /> : null}

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
