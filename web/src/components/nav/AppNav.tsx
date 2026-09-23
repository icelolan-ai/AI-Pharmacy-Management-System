"use client";

import Link from "next/link";

import { can, type Ability } from "@/lib/abilities";
import { useCollapsedGroups } from "@/lib/nav/collapsed-groups";

export type NavItem = { href: string; label: string; ability?: Ability };

/** A run of links under one heading. `heading: null` is the block at the top
 *  that carries no heading at all — the pages used every day, which D43 says
 *  may never fold: having to open something before selling would be worse
 *  than the clutter folding is meant to fix. */
export type NavGroup = { heading: string | null; items: readonly NavItem[] };

/** True for the page being looked at. "/" has to match exactly or it would
 *  claim every page, since every path starts with a slash. */
export function isCurrent(href: string, pathname: string): boolean {
  return href === "/" ? pathname === "/" : pathname.startsWith(href);
}

export function visibleItems(items: readonly NavItem[], role: string | null | undefined) {
  return items.filter((item) => !item.ability || can(role, item.ability));
}

/** Groups with nothing left in them are dropped entirely, heading and all.
 *  A heading with no links under it is worse than no heading: it tells a
 *  cashier the shop has reports somewhere and they simply cannot find them. */
export function visibleGroups(
  groups: readonly NavGroup[],
  role: string | null | undefined,
): { heading: string | null; items: NavItem[] }[] {
  return groups
    .map((group) => ({ heading: group.heading, items: visibleItems(group.items, role) }))
    .filter((group) => group.items.length > 0);
}

/** The one menu, rendered either down the side on a wide screen or inside the
 *  panel on a phone. Both read the same array, so the two can never disagree,
 *  and D43 gives them the same folding behaviour rather than splitting by
 *  device.
 *
 *  D34 runs through the details: the row a person is on is marked with the
 *  words "กำลังดูอยู่" as well as the dark fill, and a folding heading states
 *  "เปิดอยู่" or "พับอยู่" in words rather than leaving a chevron to carry it.
 */
export function AppNav({
  groups,
  role,
  userId,
  pathname,
  variant,
  onNavigate,
}: {
  groups: readonly NavGroup[];
  role: string | null | undefined;
  userId: string | null | undefined;
  pathname: string;
  variant: "sidebar" | "panel";
  onNavigate?: () => void;
}) {
  const panel = variant === "panel";
  const { collapsed, toggle } = useCollapsedGroups(userId);

  return (
    <nav aria-label="เมนูหลัก" className={panel ? "space-y-3" : "space-y-2"}>
      {visibleGroups(groups, role).map((group) => {
        const holdsCurrentPage = group.items.some((item) => isCurrent(item.href, pathname));
        // The top block never folds (D43). Everything else obeys the stored
        // preference, except that the group you are standing in stays open —
        // folding the page you are looking at would be nonsense.
        const foldable = group.heading !== null;
        const open = !foldable || holdsCurrentPage || !collapsed.has(group.heading!);

        return (
          <div key={group.heading ?? "__everyday"} className="space-y-1">
            {foldable ? (
              <button
                type="button"
                onClick={() => toggle(group.heading!)}
                disabled={holdsCurrentPage}
                aria-expanded={open}
                className={[
                  "flex w-full items-center justify-between gap-2 rounded-md px-3 text-left",
                  panel ? "min-h-11 text-sm" : "min-h-9 text-xs",
                  "font-medium tracking-wide text-slate-500",
                  holdsCurrentPage ? "cursor-default" : "hover:bg-slate-100",
                ].join(" ")}
              >
                <span className="truncate">{group.heading}</span>
                <span className="shrink-0 text-[11px] font-normal text-slate-400">
                  {holdsCurrentPage ? "เปิดอยู่ · กำลังดูหน้าในกลุ่มนี้" : open ? "เปิดอยู่" : "พับอยู่"}
                </span>
              </button>
            ) : null}

            {open
              ? group.items.map((item) => {
                  const current = isCurrent(item.href, pathname);
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      aria-current={current ? "page" : undefined}
                      onClick={onNavigate}
                      className={[
                        "flex items-center justify-between gap-3 rounded-md",
                        // D43: once a group is opened its links read as a list,
                        // so they are separated rather than run together.
                        foldable ? "border-b border-slate-100 last:border-b-0" : "",
                        panel ? "min-h-12 px-4 py-3 text-base" : "px-3 py-2 text-sm",
                        current ? "bg-slate-900 text-white" : "text-slate-700 hover:bg-slate-100",
                      ].join(" ")}
                    >
                      <span className="truncate">{item.label}</span>
                      {current ? (
                        <span
                          className={[
                            "shrink-0 rounded bg-white/20 px-1.5 py-0.5 font-medium",
                            panel ? "text-xs" : "text-[10px]",
                          ].join(" ")}
                        >
                          กำลังดูอยู่
                        </span>
                      ) : null}
                    </Link>
                  );
                })
              : null}
          </div>
        );
      })}
    </nav>
  );
}
