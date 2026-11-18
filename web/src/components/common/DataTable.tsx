"use client";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ChevronRight } from "lucide-react";

import { cn } from "@/lib/utils";

export type Column<T> = {
  key: string;
  header: string;
  /** right-align numbers */
  align?: "left" | "right";
  className?: string;
  cell: (row: T) => React.ReactNode;
};

/** A row on a phone as an iOS list row (D78 round 3): a rounded icon tile,
 *  the name in bold, one line of secondary detail, and the value that
 *  matters most on the right. What a row leaves out must be on the page the
 *  row opens — the list is for finding, the page is for reading. */
export type PhoneRow<T> = {
  icon: (row: T) => React.ReactNode;
  title: (row: T) => React.ReactNode;
  subtitle?: (row: T) => React.ReactNode;
  /** A status pill under the subtitle, for one too long to sit on the right
   *  without squeezing the name until its words break (D44). */
  badge?: (row: T) => React.ReactNode;
  /** Short: a number, a word. The name gets the room, not this. */
  trailing?: (row: T) => React.ReactNode;
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
  phoneRow,
}: {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  onRowClick?: (row: T) => void;
  rowClassName?: (row: T) => string | undefined;
  caption?: string;
  /** Given: a phone shows iOS list rows. Not given: the cards of round 2. */
  phoneRow?: PhoneRow<T>;
}) {
  const [title, ...details] = columns;
  return (
    <>
      {phoneRow ? (
        <ul className="list-group sm:hidden" aria-label={caption}>
          {rows.map((row) => (
            <li
              key={rowKey(row)}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
              data-opens={onRowClick ? "" : undefined}
              className={cn("list-row", rowClassName?.(row))}
            >
              <span aria-hidden="true" className="list-row-icon">
                {phoneRow.icon(row)}
              </span>
              <div className="list-row-main">
                <p className="list-row-title">{phoneRow.title(row)}</p>
                {phoneRow.subtitle ? <p className="list-row-sub">{phoneRow.subtitle(row)}</p> : null}
                {phoneRow.badge ? <div className="list-row-badge">{phoneRow.badge(row)}</div> : null}
              </div>
              {phoneRow.trailing ? <div className="list-row-trailing">{phoneRow.trailing(row)}</div> : null}
              {onRowClick ? <ChevronRight aria-hidden="true" className="list-row-chevron" /> : null}
            </li>
          ))}
        </ul>
      ) : (
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
      )}

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
