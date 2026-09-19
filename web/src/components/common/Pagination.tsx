"use client";

import { Button } from "@/components/ui/button";

/** Page through a list that the API has already counted for us.
 *  `total` comes from the API, never from the rows on screen — history grows
 *  and only a page of it is ever loaded. */
export function Pagination({
  total,
  limit,
  offset,
  onOffsetChange,
  busy,
}: {
  total: number;
  limit: number;
  offset: number;
  onOffsetChange: (offset: number) => void;
  busy?: boolean;
}) {
  if (total <= limit) return null;

  const page = Math.floor(offset / limit) + 1;
  const pages = Math.max(1, Math.ceil(total / limit));
  const first = total === 0 ? 0 : offset + 1;
  const last = Math.min(offset + limit, total);

  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <p className="text-xs text-slate-500">
        แสดง {first}–{last} จากทั้งหมด {total} รายการ
      </p>
      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={busy || offset === 0}
          onClick={() => onOffsetChange(Math.max(0, offset - limit))}
        >
          ← ก่อนหน้า
        </Button>
        <span className="text-xs text-slate-600">
          หน้า {page} / {pages}
        </span>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={busy || last >= total}
          onClick={() => onOffsetChange(offset + limit)}
        >
          ถัดไป →
        </Button>
      </div>
    </div>
  );
}
