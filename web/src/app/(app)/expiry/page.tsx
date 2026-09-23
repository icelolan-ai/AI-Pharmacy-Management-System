"use client";

import { useState } from "react";

import { useAuth } from "@/components/auth-provider";
import { AccessDenied } from "@/components/common/AccessDenied";
import { EmptyState } from "@/components/common/EmptyState";
import { ErrorState } from "@/components/common/ErrorState";
import { PageHeader } from "@/components/common/PageHeader";
import { SkeletonTable } from "@/components/common/SkeletonTable";
import { ExpiringTable } from "@/components/reports/ExpiringTable";
import { useAdjustFromReport } from "@/components/reports/useAdjustFromReport";
import { AdjustStockDialog } from "@/components/stock/AdjustStockDialog";
import { Button } from "@/components/ui/button";
import { listExpiringReport, RISK_LABEL, RISK_ORDER, type RiskLevel } from "@/lib/api/reports";
import { ABILITIES, can } from "@/lib/abilities";
import { RISK_META } from "@/lib/format/expiry";
import { useSection } from "@/lib/use-section";

export default function ExpiryPage() {
  const { me } = useAuth();
  const allowed = can(me?.role, ABILITIES.viewReports);
  // D33: the page gate above is viewReports = owner + pharmacist, the same
  // pair as viewCost, so there is no second layer to apply here.
  const canAdjust = can(me?.role, ABILITIES.adjustStock);

  const [tab, setTab] = useState<RiskLevel>("critical");

  const report = useSection((signal) => listExpiringReport({ days: 180, signal }), {
    enabled: allowed,
    errorMessage: "โหลดรายงานยาใกล้หมดอายุไม่สำเร็จ",
  });

  const adjust = useAdjustFromReport(() => report.reload());

  if (me && !allowed) {
    return (
      <div className="space-y-4">
        <PageHeader title="ใกล้หมดอายุ" />
        <AccessDenied />
      </div>
    );
  }

  const summary = report.data?.summary;
  const rows = (report.data?.items ?? []).filter((row) => row.risk_level === tab);

  return (
    <div className="space-y-4">
      <PageHeader
        title="ยาใกล้หมดอายุ"
        description="ล็อตที่ยังขายได้ แต่เหลือเวลาไม่เกิน 180 วัน"
        action={
          <Button variant="outline" onClick={report.reload} disabled={report.loading}>
            {report.loading ? "กำลังโหลด..." : "รีเฟรช"}
          </Button>
        }
      />

      {report.error ? (
        <ErrorState message={report.error} onRetry={report.reload} retrying={report.loading} />
      ) : null}
      {adjust.error ? <ErrorState message={adjust.error} /> : null}

      <div className="flex flex-wrap gap-1" role="tablist" aria-label="ระดับความเสี่ยง">
        {RISK_ORDER.map((risk) => (
          <Button
            key={risk}
            role="tab"
            aria-selected={tab === risk}
            size="sm"
            variant={tab === risk ? "default" : "outline"}
            onClick={() => setTab(risk)}
          >
            <span aria-hidden="true">{RISK_META[risk].icon}</span> {RISK_LABEL[risk]}
            <span className="ml-1 tabular-nums">({summary?.[risk]?.lot_count ?? 0})</span>
          </Button>
        ))}
      </div>

      {report.loading ? (
        <SkeletonTable rows={6} columns={5} />
      ) : !report.error && rows.length === 0 ? (
        <EmptyState title={`ไม่มีล็อตในระดับ “${RISK_LABEL[tab]}”`} />
      ) : !report.error ? (
        <ExpiringTable
          rows={rows}
          canAdjust={canAdjust}
          adjustBusy={adjust.busy}
          onAdjust={(row) => void adjust.openFor(row.lot_id, row.unit)}
        />
      ) : null}

      {canAdjust && adjust.open ? (
        <AdjustStockDialog
          open
          onOpenChange={adjust.setOpen}
          lot={adjust.lot}
          unit={adjust.unit}
          onAdjusted={adjust.handleAdjusted}
        />
      ) : null}
    </div>
  );
}
