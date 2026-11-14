"use client";

import Link from "next/link";

import { isCurrent, visibleGroups, withoutHrefs, type NavGroup } from "@/lib/nav/items";
import { useFoldedGroups } from "@/lib/nav/folded-groups";
import { isFoldable, isGroupOpen } from "@/lib/nav/folding";

export { isCurrent, visibleGroups, visibleItems, type NavGroup, type NavItem } from "@/lib/nav/items";

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
 *  label, and the row a person is on says "กำลังดูอยู่" as well as turning
 *  dark. A group's name is never truncated — if the status will not fit
 *  beside it, the status moves to its own line.
 *
 *  The folded state: in the sidebar it is spelled out ("พับอยู่ / เปิดอยู่").
 *  In the phone's menu (D78 round 2) it is an arrow, ▸ turning to ▾ — a
 *  shape, not a colour, so D34 still holds — driven by the button's own
 *  aria-expanded, which is also what a screen reader announces. One state,
 *  read by both. The phone's groups are rounded boxes like iPhone Settings,
 *  and leave out what the bottom bar already shows (`exclude`).
 */
export function AppNav({
  groups,
  role,
  userId,
  pathname,
  variant,
  onNavigate,
  exclude,
}: {
  groups: readonly NavGroup[];
  role: string | null | undefined;
  userId: string | null | undefined;
  pathname: string;
  variant: "sidebar" | "panel";
  onNavigate?: () => void;
  /** Addresses to leave out — the phone's bottom bar passes its own. */
  exclude?: ReadonlySet<string>;
}) {
  const panel = variant === "panel";
  const { exceptions, toggle } = useFoldedGroups(userId, variant);
  return (
    <nav aria-label="เมนูหลัก" className="space-y-3">
      {visibleGroups(withoutHrefs(groups, exclude), role).map((group) => {
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
          <div key={group.heading ?? "__everyday"} className={panel ? "menu-group" : undefined}>
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
                {panel ? (
                  // Phone: the arrow carries open/folded, as a shape; the
                  // words left say only that this group holds the page.
                  <span className="flex w-full items-center justify-between gap-3">
                    <span className="min-w-0">
                      <span className="block">{group.heading}</span>
                      {holdsCurrentPage ? (
                        <span className="block text-xs font-normal text-slate-600">ดูหน้านี้อยู่</span>
                      ) : null}
                    </span>
                    <span aria-hidden="true" className="group-chevron">
                      ▸
                    </span>
                  </span>
                ) : (
                  <>
                    {/* Never truncated (D44): the name gets the whole width and
                        the status sits on its own line underneath. */}
                    <span className="block">{group.heading}</span>
                    <span className="block text-xs font-normal text-slate-500">
                      {open
                        ? holdsCurrentPage
                          ? "เปิดอยู่ · ดูหน้านี้อยู่"
                          : "เปิดอยู่"
                        : "พับอยู่"}
                    </span>
                  </>
                )}
              </button>
            ) : null}

            {open ? (
              <div
                className={
                  // D44: the tree. A line down the left of the group, and each
                  // link branches off it. Only the headed groups are indented;
                  // the everyday block stays at the left edge where it reads as
                  // the top level. The phone's boxes list rows plainly instead.
                  panel ? "menu-group-rows" : foldable ? "ml-3 space-y-0.5 border-l border-slate-200 pt-1" : "space-y-0.5"
                }
              >
                {group.items.map((item) => {
                  const current = isCurrent(item.href, pathname);
                  return (
                    <div key={item.href} className={foldable && !panel ? "relative pl-4" : ""}>
                      {foldable && !panel ? (
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
