"use client";

import Link from "next/link";

import { can, type Ability } from "@/lib/abilities";

export type NavItem = { href: string; label: string; ability?: Ability };

/** True for the page being looked at. "/" has to match exactly or it would
 *  claim every page, since every path starts with a slash. */
export function isCurrent(href: string, pathname: string): boolean {
  return href === "/" ? pathname === "/" : pathname.startsWith(href);
}

export function visibleItems(items: readonly NavItem[], role: string | null | undefined) {
  return items.filter((item) => !item.ability || can(role, item.ability));
}

/** The one list of links, rendered either down the side on a wide screen or
 *  inside the panel on a phone. Both read the same array, so a change to the
 *  menu can never leave the two disagreeing.
 *
 *  D34: the row a person is on is marked with the words "กำลังดูอยู่" as well
 *  as the dark fill, because colour on its own is not allowed to carry
 *  meaning. Rows are at least 44px tall on the phone so they can be hit
 *  without aiming.
 */
export function AppNav({
  items,
  role,
  pathname,
  variant,
  onNavigate,
}: {
  items: readonly NavItem[];
  role: string | null | undefined;
  pathname: string;
  variant: "sidebar" | "panel";
  onNavigate?: () => void;
}) {
  const panel = variant === "panel";

  return (
    <nav className={panel ? "space-y-1" : "space-y-1"} aria-label="เมนูหลัก">
      {visibleItems(items, role).map((item) => {
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
                  "shrink-0 rounded px-1.5 py-0.5 font-medium",
                  panel ? "bg-white/20 text-xs" : "bg-white/20 text-[10px]",
                ].join(" ")}
              >
                กำลังดูอยู่
              </span>
            ) : null}
          </Link>
        );
      })}
    </nav>
  );
}
