"use client";

import { useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { useAuth } from "@/components/auth-provider";
import { AccessDenied } from "@/components/common/AccessDenied";
import { EmptyState } from "@/components/common/EmptyState";
import { ErrorState } from "@/components/common/ErrorState";
import { MoneyText } from "@/components/common/MoneyText";
import { PageHeader } from "@/components/common/PageHeader";
import { QtyText } from "@/components/common/QtyText";
import { RiskSummaryCards } from "@/components/reports/RiskSummaryCards";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  getInventoryValue,
  listExpiredReport,
  listExpiringReport,
  listLowStockReport,
  listStockReport,
  nearExpiryValue,
  totalLotCount,
} from "@/lib/api/reports";
import { ABILITIES, can } from "@/lib/abilities";
import { formatClockTime } from "@/lib/format/date";
import { describeExpiry } from "@/lib/format/expiry";
import { percentOfMoney } from "@/lib/format/money";
import { useSection } from "@/lib/use-section";

function SectionShell({
  title,
  loading,
  error,
  onRetry,
  children,
  action,
}: {
  title: string;
  loading: boolean;
  error: string | null;
  onRetry: () => void;
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <section className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-slate-900">{title}</h2>
        {action}
      </div>
      {error ? (
        <ErrorState message={error} onRetry={onRetry} retrying={loading} />
      ) : loading ? (
        <Skeleton className="h-24 w-full" />
      ) : (
        children
      )}
    </section>
  );
}

export default function DashboardPage() {
  const router = useRouter();
  const { me } = useAuth();
  const allowed = can(me?.role, ABILITIES.viewReports);
  const canSeeValue = can(me?.role, ABILITIES.viewCost);
  const canSeeInventoryValue = can(me?.role, ABILITIES.viewInventoryValue);

  // Five independent sections: each renders when ready and retries on its own.
  const expiring = useSection((signal) => listExpiringReport({ days: 180, signal }), {
    enabled: allowed,
    errorMessage: "โหลดข้อมูลยาใกล้หมดอายุไม่สำเร็จ",
  });
  const expired = useSection((signal) => listExpiredReport({ signal }), {
    enabled: allowed,
    errorMessage: "โหลดข้อมูลยาที่ขายไม่ได้แล้วไม่สำเร็จ",
  });
  const lowStock = useSection((signal) => listLowStockReport({ signal }), {
    enabled: allowed,
    errorMessage: "โหลดข้อมูลยาใกล้หมดไม่สำเร็จ",
  });
  const stock = useSection((signal) => listStockReport({ signal }), {
    enabled: allowed,
    errorMessage: "โหลดข้อมูลคลังยาไม่สำเร็จ",
  });
  const inventoryValue = useSection((signal) => getInventoryValue({ limit: 1, signal }), {
    enabled: allowed && canSeeInventoryValue,
    errorMessage: "โหลดมูลค่าคลังไม่สำเร็จ",
  });

  // The newest of the sections that have loaded — no component reads the clock.
  const loadedAt = useMemo(() => {
    const stamps = [expiring, expired, lowStock, stock, inventoryValue]
      .map((section) => section.loadedAt)
      .filter((stamp): stamp is number => stamp !== null);
    return stamps.length > 0 ? Math.max(...stamps) : null;
  }, [expiring.loadedAt, expired.loadedAt, lowStock.loadedAt, stock.loadedAt, inventoryValue.loadedAt]);

  if (me && !allowed) {
    return (
      <div className="space-y-4">
        <PageHeader title="ภาพรวมร้าน" />
        <AccessDenied />
      </div>
    );
  }

  function reloadAll() {
    expiring.reload();
    expired.reload();
    lowStock.reload();
    stock.reload();
    if (canSeeInventoryValue) inventoryValue.reload();
  }

  const summary = expiring.data?.summary;
  const expiringRows = expiring.data?.items ?? [];
  const topExpiring = expiringRows.slice(0, 3);
  const lowStockRows = lowStock.data?.items ?? [];
  const topLowStock = lowStockRows.slice(0, 3);

  const unsetReorderCount = (stock.data?.items ?? []).filter(
    (row) => row.reorder_point === null,
  ).length;

  const stockEmpty =
    stock.data !== null &&
    stock.data.total === 0 &&
    expiring.data !== null &&
    expired.data !== null &&
    expiringRows.length === 0 &&
    (expired.data?.items.length ?? 0) === 0;

  const nearExpiry = summary ? nearExpiryValue(summary) : null;
  const totalValue = inventoryValue.data?.total_value;
  const nearExpiryPercent =
    nearExpiry && totalValue ? percentOfMoney(nearExpiry, totalValue) : null;

  return (
    <div className="space-y-6">
      <PageHeader
        title="ภาพรวมร้าน"
        description={loadedAt === null ? "กำลังโหลด..." : `อัปเดตล่าสุด ${formatClockTime(loadedAt)} น.`}
        action={
          <Button variant="outline" onClick={reloadAll}>
            รีเฟรช
          </Button>
        }
      />

      {stockEmpty ? (
        <EmptyState
          title="📦 ยังไม่มีข้อมูลในระบบ"
          description="เริ่มจากรับสินค้าเข้าคลัง แล้วภาพรวมจะแสดงที่นี่"
          action={<Button onClick={() => router.push("/stock")}>ไปหน้าคลังยา</Button>}
        />
      ) : null}

      <SectionShell
        title="ยาใกล้หมดอายุ (180 วันข้างหน้า)"
        loading={expiring.loading}
        error={expiring.error}
        onRetry={expiring.reload}
        action={
          <Link href="/expiry" className="text-sm text-slate-600 underline-offset-2 hover:underline">
            ดูทั้งหมด
          </Link>
        }
      >
        {summary && totalLotCount(summary) === 0 ? (
          <div className="rounded-lg border border-green-200 bg-green-50 px-4 py-3">
            <p className="text-sm font-medium text-green-800">
              ✅ ไม่มียาที่ขายได้ไม่ถึง 180 วันข้างหน้า
            </p>
          </div>
        ) : summary ? (
          <>
            <RiskSummaryCards summary={summary} canSeeValue={canSeeValue} />
            <ul className="mt-3 space-y-1">
              {topExpiring.map((row) => {
                const expiry = describeExpiry(row.expiry_date, row.days_remaining);
                return (
                  <li key={row.lot_id} className="text-sm text-slate-700">
                    <span aria-hidden="true">{expiry.icon}</span> {row.medicine_name} ล็อต{" "}
                    {row.lot_number} — {expiry.headline} ({expiry.detail}){" "}
                    <QtyText value={row.quantity_remaining} unit={row.unit} />
                    {canSeeValue ? (
                      <>
                        {" · "}
                        <MoneyText value={row.stock_value} withUnit />
                      </>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          </>
        ) : null}
      </SectionShell>

      <SectionShell
        title="ยาที่ขายไม่ได้แล้ว"
        loading={expired.loading}
        error={expired.error}
        onRetry={expired.reload}
        action={
          <Link
            href="/reports/expired"
            className="text-sm text-slate-600 underline-offset-2 hover:underline"
          >
            ดูทั้งหมด
          </Link>
        }
      >
        <Card>
          <CardContent className="pt-6">
            <p className="text-2xl font-semibold tabular-nums text-slate-900">
              {expired.data?.total ?? 0}
              <span className="ml-1 text-sm font-normal text-slate-500">ล็อต</span>
            </p>
            <p className="mt-1 text-sm text-slate-600">ยังอยู่บนชั้น ต้องนำออกจากชั้นวาง</p>
          </CardContent>
        </Card>
      </SectionShell>

      <SectionShell
        title="ยาที่ใกล้หมด"
        loading={lowStock.loading}
        error={lowStock.error}
        onRetry={lowStock.reload}
        action={
          <Link
            href="/reports/low-stock"
            className="text-sm text-slate-600 underline-offset-2 hover:underline"
          >
            ดูทั้งหมด
          </Link>
        }
      >
        {topLowStock.length === 0 ? (
          <p className="text-sm text-slate-600">ไม่มียาที่ต่ำกว่าจุดสั่งซื้อ</p>
        ) : (
          <ul className="space-y-1">
            {topLowStock.map((row) => (
              <li key={row.medicine_id} className="text-sm text-slate-700">
                {row.name} — เหลือ <QtyText value={row.available_quantity} unit={row.unit} /> จากจุดสั่งซื้อ{" "}
                {row.reorder_point} (ขาดอีก {row.shortage} {row.unit})
              </li>
            ))}
          </ul>
        )}
        {unsetReorderCount > 0 && !stock.loading && !stock.error ? (
          <p className="mt-2 text-xs text-slate-500">
            (นับเฉพาะยาที่ตั้งจุดสั่งซื้อไว้แล้ว — ยังไม่ตั้งค่า {unsetReorderCount} รายการ){" "}
            <Link href="/stock" className="underline underline-offset-2">
              ไปหน้าคลังยา
            </Link>
          </p>
        ) : null}
      </SectionShell>

      {canSeeInventoryValue ? (
        <SectionShell
          title="มูลค่าคลัง"
          loading={inventoryValue.loading}
          error={inventoryValue.error}
          onRetry={inventoryValue.reload}
          action={
            <Link
              href="/reports/inventory-value"
              className="text-sm text-slate-600 underline-offset-2 hover:underline"
            >
              ดูทั้งหมด
            </Link>
          }
        >
          <div className="grid gap-3 sm:grid-cols-3">
            <Card>
              <CardContent className="pt-6">
                <p className="text-sm text-slate-600">มูลค่าคลังรวม</p>
                <p className="mt-1 text-2xl font-semibold text-slate-900">
                  <MoneyText value={totalValue} withUnit />
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <p className="text-sm text-slate-600">เงินจมในยาใกล้หมดอายุ</p>
                <p className="mt-1 text-2xl font-semibold text-amber-700">
                  <MoneyText value={nearExpiry} withUnit />
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  {nearExpiryPercent === null
                    ? "ยังคำนวณสัดส่วนไม่ได้"
                    : `${nearExpiryPercent}% ของมูลค่าคลังรวม · ยังขายได้ ควรรีบระบาย`}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <p className="text-sm text-slate-600">มูลค่ายาที่ขายไม่ได้แล้ว</p>
                <p className="mt-1 text-2xl font-semibold text-red-700">
                  <MoneyText value={inventoryValue.data?.expired_value} withUnit />
                </p>
                <p className="mt-1 text-xs text-slate-500">ความสูญเสีย — ขายไม่ได้แล้ว</p>
              </CardContent>
            </Card>
          </div>
        </SectionShell>
      ) : null}
    </div>
  );
}
