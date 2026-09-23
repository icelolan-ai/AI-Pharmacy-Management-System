"use client";

import Link from "next/link";

import { can, type Ability } from "@/lib/abilities";

export type NavItem = { href: string; label: string; ability?: Ability };

/** A run of links under one heading. `heading: null` is the block at the top
 *  that carries no heading at all — the pages used every day, which must not
 *  sit behind anything a person has to read past first. */
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
 *  panel on a phone. Both read the same array, so the two can never disagree.
 *
 *  D34: the row a person is on is marked with the words "กำลังดูอยู่" as well
 *  as the dark fill, because colour on its own is not allowed to carry
 *  meaning. Rows on the phone are large enough to hit without aiming.
 *
 *  Headings are plain text. They are not buttons and must not look like ones —
 *  nothing here folds away, because something folded is something an older
 *  user has to remember the location of (U-3).
 */
export function AppNav({
  groups,
  role,
  pathname,
  variant,
  onNavigate,
}: {
  groups: readonly NavGroup[];
  role: string | null | undefined;
  pathname: string;
  variant: "sidebar" | "panel";
  onNavigate?: () => void;
}) {
  const panel = variant === "panel";

  return (
    <nav aria-label="เมนูหลัก" className={panel ? "space-y-4" : "space-y-3"}>
      {visibleGroups(groups, role).map((group) => (
        <div key={group.heading ?? "__top"} className="space-y-1">
          {group.heading ? (
            <p
              className={[
                "px-3 font-medium tracking-wide text-slate-500",
                panel ? "pt-1 text-sm" : "text-xs",
              ].join(" ")}
            >
              {group.heading}
            </p>
          ) : null}

          {group.items.map((item) => {
            const current = isCurrent(item.href, pathname);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={current ? "page" : undefined}
                onClick={onNavigate}
                className={[
                  "flex items-center justify-between gap-3 rounded-md",
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
          })}
        </div>
      ))}
    </nav>
  );
}
