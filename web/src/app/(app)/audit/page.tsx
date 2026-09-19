"use client";

import { useState } from "react";

import { useAuth } from "@/components/auth-provider";
import { AccessDenied } from "@/components/common/AccessDenied";
import { DataTable, type Column } from "@/components/common/DataTable";
import { DateRangeFilter, lastDays, type DateRange } from "@/components/common/DateRangeFilter";
import { EmptyState } from "@/components/common/EmptyState";
import { ErrorState } from "@/components/common/ErrorState";
import { PageHeader } from "@/components/common/PageHeader";
import { Pagination } from "@/components/common/Pagination";
import { SkeletonTable } from "@/components/common/SkeletonTable";
import { Label } from "@/components/ui/label";
import { listAuditLogs, type AuditLog } from "@/lib/api/audit";
import { ABILITIES, can } from "@/lib/abilities";
import {
  actionLabel,
  changedFields,
  entityLabelFrom,
  formatAuditValue,
  TABLE_LABEL_TH,
  tableLabel,
} from "@/lib/constants";
import { formatDateTimeBE } from "@/lib/format/date";
import { useSection } from "@/lib/use-section";

const PAGE_SIZE = 25;

/** The audit trail, owner only. Everything on screen is Thai: no raw table
 *  names, no raw action words, and no full UUIDs. */
export default function AuditPage() {
  const { me } = useAuth();
  const allowed = can(me?.role, ABILITIES.viewAuditLog);

  const [range, setRange] = useState<DateRange>(() => lastDays(7));
  const [table, setTable] = useState("");
  const [offset, setOffset] = useState(0);

  const logs = useSection(
    (signal) =>
      listAuditLogs({
        tableName: table || undefined,
        dateFrom: range.from,
        dateTo: range.to,
        limit: PAGE_SIZE,
        offset,
        signal,
      }),
    {
      enabled: allowed,
      errorMessage: "โหลดประวัติการแก้ไขไม่สำเร็จ",
      deps: [table, range.from, range.to, offset],
    },
  );

  if (me && !allowed) {
    return (
      <div className="space-y-4">
        <PageHeader title="ตรวจสอบย้อนหลัง" />
        <AccessDenied />
      </div>
    );
  }

  const rows = logs.data?.items ?? [];

  const columns: Column<AuditLog>[] = [
    {
      key: "when",
      header: "เมื่อไร",
      cell: (log) => (
        <span className="text-sm text-slate-600">{formatDateTimeBE(log.created_at)} น.</span>
      ),
    },
    {
      key: "who",
      header: "ใคร",
      cell: (log) => log.changed_by_name ?? "—",
    },
    {
      key: "what",
      header: "ทำอะไร",
      cell: (log) => (
        <span className="text-slate-900">
          {actionLabel(log.action)} {tableLabel(log.table_name)} ({entityLabelFrom(log)})
        </span>
      ),
    },
    {
      key: "changes",
      header: "ค่าเดิม → ค่าใหม่",
      cell: (log) => {
        const changes = changedFields(log);
        if (changes.length === 0) {
          return <span className="text-sm text-slate-400">—</span>;
        }
        return (
          <div className="space-y-0.5">
            {changes.slice(0, 4).map((change) => (
              <p key={change.field} className="text-xs text-slate-600">
                <span className="text-slate-500">{change.field}</span>{" "}
                {formatAuditValue(change.before)} → {formatAuditValue(change.after)}
              </p>
            ))}
            {changes.length > 4 ? (
              <p className="text-xs text-slate-400">และอีก {changes.length - 4} ช่อง</p>
            ) : null}
          </div>
        );
      },
    },
    {
      key: "reason",
      header: "เหตุผล",
      cell: (log) => (
        <span className="text-sm text-slate-600">{log.reason ?? "—"}</span>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <PageHeader
        title="ตรวจสอบย้อนหลัง"
        description="ใครแก้อะไร เมื่อไร และเปลี่ยนจากอะไรเป็นอะไร"
      />

      <div className="flex flex-wrap items-end gap-3">
        <DateRangeFilter
          value={range}
          busy={logs.loading}
          onChange={(next) => {
            setRange(next);
            setOffset(0);
          }}
        />
        <div>
          <Label htmlFor="audit-table" className="text-xs text-slate-600">
            ตาราง
          </Label>
          <select
            id="audit-table"
            value={table}
            disabled={logs.loading}
            onChange={(event) => {
              setTable(event.target.value);
              setOffset(0);
            }}
            className="h-8 w-full min-w-44 rounded-lg border border-input bg-transparent px-2.5 text-base md:text-sm"
          >
            <option value="">ทั้งหมด</option>
            {Object.entries(TABLE_LABEL_TH).map(([name, label]) => (
              <option key={name} value={name}>
                {label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {logs.error ? (
        <ErrorState message={logs.error} onRetry={logs.reload} retrying={logs.loading} />
      ) : null}

      {logs.loading ? (
        <SkeletonTable rows={8} columns={5} />
      ) : rows.length === 0 ? (
        <EmptyState title="ไม่มีการแก้ไขในช่วงวันที่ที่เลือก" />
      ) : (
        <>
          <DataTable columns={columns} rows={rows} rowKey={(log) => log.id} caption="ประวัติการแก้ไข" />
          <Pagination
            total={logs.data?.total ?? 0}
            limit={PAGE_SIZE}
            offset={offset}
            onOffsetChange={setOffset}
            busy={logs.loading}
          />
        </>
      )}

      <p className="text-xs text-slate-500">
        ตัวกรอง &ldquo;ผู้ใช้&rdquo; ยังไม่เปิดใช้ — API กรองด้วยรหัสผู้ใช้ ต้องรอรายชื่อผู้ใช้จากงาน 5.8ก
      </p>
    </div>
  );
}
