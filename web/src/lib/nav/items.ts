import { can, type Ability } from "@/lib/abilities";

/** The menu's entries and the one filter that decides who sees which (D78
 *  moved these out of AppNav so the bottom bar and the home page use the
 *  same filter without loading a React component). AppNav re-exports them.
 */

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

/** The same groups without the given addresses — the phone's ☰ menu leaves
 *  out what its bottom bar already shows (D78 round 2). */
export function withoutHrefs(groups: readonly NavGroup[], exclude: ReadonlySet<string> | undefined): NavGroup[] {
  return groups.map((group) => ({
    ...group,
    items: exclude ? group.items.filter((item) => !exclude.has(item.href)) : group.items,
  }));
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
