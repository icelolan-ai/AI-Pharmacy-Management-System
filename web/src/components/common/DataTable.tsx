"use client";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";

export type Column<T> = {
  key: string;
  header: string;
  /** right-align numbers */
  align?: "left" | "right";
  className?: string;
  cell: (row: T) => React.ReactNode;
};

/** A table on a computer; on a phone (D78 round 2), the same rows as cards —
 *  one row, one card. The first column is the card's title, in bold; every
 *  other column sits underneath as its header and value, so nothing a
 *  column shows is lost and nothing is cut off (D44). Every page with a
 *  table gets this from here, and the gap between cards comes from the
 *  shared --card-gap (D48). */
export function DataTable<T>({
  columns,
  rows,
  rowKey,
  onRowClick,
  rowClassName,
  caption,
}: {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  onRowClick?: (row: T) => void;
  rowClassName?: (row: T) => string | undefined;
  caption?: string;
}) {
  const [title, ...details] = columns;
  return (
    <>
      <ul className="card-list sm:hidden" aria-label={caption}>
        {rows.map((row) => (
          <li
            key={rowKey(row)}
            onClick={onRowClick ? () => onRowClick(row) : undefined}
            className={cn(
              "data-card rounded-xl border border-slate-200 bg-white p-4 shadow-sm",
              onRowClick && "cursor-pointer active:bg-slate-50",
              rowClassName?.(row),
            )}
          >
            {title ? <div className="text-base font-semibold break-words text-slate-900">{title.cell(row)}</div> : null}
            {details.length > 0 ? (
              <dl className="mt-2 grid grid-cols-[auto_1fr] items-baseline gap-x-3 gap-y-1 text-sm">
                {details.map((column) =>
                  column.header ? (
                    <div key={column.key} className="contents">
                      <dt className="text-slate-600">{column.header}</dt>
                      <dd className={cn("min-w-0 break-words text-slate-900", column.align === "right" && "text-right")}>
                        {column.cell(row)}
                      </dd>
                    </div>
                  ) : (
                    <dd key={column.key} className="col-span-2 min-w-0">
                      {column.cell(row)}
                    </dd>
                  ),
                )}
              </dl>
            ) : null}
          </li>
        ))}
      </ul>

      <div className="hidden overflow-x-auto rounded-lg border border-slate-200 bg-white sm:block">
        <Table>
          {caption ? <caption className="sr-only">{caption}</caption> : null}
          <TableHeader>
            <TableRow>
              {columns.map((column) => (
                <TableHead
                  key={column.key}
                  className={cn(column.align === "right" && "text-right", column.className)}
                >
                  {column.header}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow
                key={rowKey(row)}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
                className={cn(onRowClick && "cursor-pointer", rowClassName?.(row))}
              >
                {columns.map((column) => (
                  <TableCell
                    key={column.key}
                    className={cn(column.align === "right" && "text-right", column.className)}
                  >
                    {column.cell(row)}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </>
  );
}
