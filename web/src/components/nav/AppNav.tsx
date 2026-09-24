"use client";

import Link from "next/link";

import { can, type Ability } from "@/lib/abilities";
import { useFoldedGroups } from "@/lib/nav/folded-groups";
import { isFoldable, isGroupOpen } from "@/lib/nav/folding";

export type NavItem = { href: string; label: string; ability?: Ability };

/** A run of links under one heading. `heading: null` is the block at the top
 *  that carries no heading at all — the pages used every day, which D43 says
 *  may never fold: having to open something before selling would be worse
 *  than the clutter folding is meant to fix. */
export type NavGroup = { heading: string | null; items: readonly NavItem[] };

/** Type sizes, named once so the check can compare them as numbers rather than
 *  as strings (D43-b). D44: a group heading may never be smaller than the
 *  links beneath it — it was text-xs against text-sm and could barely be read.
 */
export const HEADING_TEXT = "text-sm";
export const ITEM_TEXT = "text-sm";
export const PANEL_ITEM_TEXT = "text-base";
export const PANEL_HEADING_TEXT = "text-base";

/** Every row a finger has to hit, including the headings (D34). */
const ROW_MIN_HEIGHT = "min-h-12";

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
 *  panel on a phone. Both read the same array, and D43 gives them the same
 *  folding behaviour rather than splitting by device.
 *
 *  D44 separates the two kinds of row by more than position. The everyday
 *  block at the top is bold and dark and starts at the left edge. Everything
 *  under a heading is lighter, indented, and hangs off a drawn tree — a
 *  vertical line down the group with a short branch into each link — with a
 *  green dot at the start of each one.
 *
 *  D34 is why none of that is load-bearing: the dot is decoration beside a
 *  label, the folded state is spelled out in words rather than left to a
 *  chevron, and the row a person is on says "กำลังดูอยู่" as well as turning
 *  dark. A group's name is never truncated — if the status will not fit
 *  beside it, the status moves to its own line.
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
  const { exceptions, toggle } = useFoldedGroups(userId, variant);

  return (
    <nav aria-label="เมนูหลัก" className="space-y-3">
      {visibleGroups(groups, role).map((group) => {
        const holdsCurrentPage = group.items.some((item) => isCurrent(item.href, pathname));
        // Both answers come from lib/nav/folding so a check can run them
        // rather than read them (D43-a). The top block never folds (D43); the
        // rest follow the device default until the person changes one.
        const foldable = isFoldable(group.heading);
        const open = isGroupOpen({
          heading: group.heading,
          holdsCurrentPage,
          exceptions,
          variant,
        });

        return (
          <div key={group.heading ?? "__everyday"}>
            {foldable ? (
              <button
                type="button"
                onClick={() => toggle(group.heading!)}
                aria-expanded={open}
                className={[
                  "flex w-full flex-col justify-center gap-0.5 rounded-md px-3 py-2 text-left",
                  ROW_MIN_HEIGHT,
                  panel ? PANEL_HEADING_TEXT : HEADING_TEXT,
                  "font-semibold text-slate-800",
                  "hover:bg-slate-100",
                ].join(" ")}
              >
                {/* Never truncated (D44): the name gets the whole width and the
                    status sits on its own line underneath. */}
                <span className="block">{group.heading}</span>
                <span className="block text-xs font-normal text-slate-500">
                  {open
                    ? holdsCurrentPage
                      ? "เปิดอยู่ · ดูหน้านี้อยู่"
                      : "เปิดอยู่"
                    : "พับอยู่"}
                </span>
              </button>
            ) : null}

            {open ? (
              <div
                className={
                  // D44: the tree. A line down the left of the group, and each
                  // link branches off it. Only the headed groups are indented;
                  // the everyday block stays at the left edge where it reads as
                  // the top level.
                  foldable ? "ml-3 space-y-0.5 border-l border-slate-200 pt-1" : "space-y-0.5"
                }
              >
                {group.items.map((item) => {
                  const current = isCurrent(item.href, pathname);
                  return (
                    <div key={item.href} className={foldable ? "relative pl-4" : ""}>
                      {foldable ? (
                        <span
                          aria-hidden="true"
                          className="absolute left-0 top-1/2 h-px w-3 bg-slate-200"
                        />
                      ) : null}
                      <Link
                        href={item.href}
                        aria-current={current ? "page" : undefined}
                        onClick={onNavigate}
                        className={[
                          // D44: a column, for the same reason the heading is
                          // one — the badge beside the name was cutting it to
                          // "ยาใกล้ห...". Nothing here truncates.
                          "flex flex-col justify-center gap-0.5 rounded-md px-3 py-2",
                          ROW_MIN_HEIGHT,
                          panel ? PANEL_ITEM_TEXT : ITEM_TEXT,
                          // D44: the everyday block is the bold, dark one; the
                          // rest read as subordinate to their heading.
                          foldable ? "font-normal" : "font-semibold",
                          current
                            ? "bg-slate-900 text-white"
                            : foldable
                              ? "text-slate-600 hover:bg-slate-100"
                              : "text-slate-900 hover:bg-slate-100",
                        ].join(" ")}
                      >
                        <span className="flex items-start gap-2">
                          {foldable ? (
                            // Decoration only — the label is right beside it, so
                            // nothing here is carried by colour (D34).
                            <span
                              aria-hidden="true"
                              className={[
                                "h-2 w-2 shrink-0 rounded-full bg-green-600",
                                panel ? "mt-2" : "mt-1.5",
                              ].join(" ")}
                            />
                          ) : null}
                          <span>{item.label}</span>
                        </span>
                        {current ? (
                          <span className="w-fit rounded bg-white/20 px-1.5 py-0.5 text-xs font-medium">
                            กำลังดูอยู่
                          </span>
                        ) : null}
                      </Link>
                    </div>
                  );
                })}
              </div>
            ) : null}
          </div>
        );
      })}
    </nav>
  );
}
