import { visibleItems, type NavGroup, type NavItem } from "@/lib/nav/items";
import { MENU } from "@/lib/nav/menu";
import { ancestry } from "@/lib/nav/routes";

/** The phone's bottom bar and the home page's big buttons (D78).
 *
 *  Neither keeps a list of who may see what. Each names menu entries by
 *  address, and whether a person sees one is decided by that entry's ability,
 *  through the same visibleItems the menu itself uses. A separate list would
 *  one day disagree with the menu, and a cashier would get a button that
 *  answers "no permission". An address that is not in the menu shows
 *  nothing (and nav-routes.check.mjs fails).
 *
 *  Labels are not written here either: each tab says exactly what its menu
 *  entry — and so its page title — says (D78 round 2: one name everywhere).
 */

export type TabIcon = "home" | "sell" | "receive" | "stock";

/** D82: หน้าแรก · คลังยา · [ขายยา] · รับสินค้า · เมนู — the owner chose the
 *  five; Chat A moved ขายยา to the middle, the raised disc, because it is
 *  what the counter does all day. `center` marks the disc. */
export const TABS: readonly { href: string; icon: TabIcon; center?: true }[] = [
  { href: "/", icon: "home" },
  { href: "/stock", icon: "stock" },
  { href: "/sell", icon: "sell", center: true },
  { href: "/receiving", icon: "receive" },
];

/** The big buttons on the phone's home page, in this order. */
export const HOME_TASKS: readonly string[] = ["/sell", "/scan", "/receiving", "/expiry", "/stock"];

/** `menu` is MENU in the app; a check passes another to prove that a tab
 *  follows its entry's permission (no role lacks ขายยา today). */
export function menuItem(href: string, menu: readonly NavGroup[] = MENU): NavItem | undefined {
  for (const group of menu) {
    const item = group.items.find((entry) => entry.href === href);
    if (item) return item;
  }
  return undefined;
}

function allowed(href: string, role: string | null | undefined, menu: readonly NavGroup[] = MENU): boolean {
  const item = menuItem(href, menu);
  return item !== undefined && visibleItems([item], role).length === 1;
}

export function visibleTabs(role: string | null | undefined, menu: readonly NavGroup[] = MENU) {
  return TABS.filter((tab) => allowed(tab.href, role, menu)).map((tab) => ({ ...tab, label: menuItem(tab.href, menu)!.label }));
}

/** What the bottom bar draws, slot by slot.
 *
 *  Until the profile has loaded nobody knows the role, and a tab that needs
 *  a permission could go either way. It is neither shown (it may not be
 *  allowed) nor left out (the tabs after it would jump sideways when it
 *  arrived, under a finger about to press one). Its slot is kept, empty: not
 *  a link, nothing to press. Once the role is known it becomes the tab, or
 *  — if this role may not use it — the slot goes (Chat A, after D78). */
export type TabSlot =
  | { kind: "tab"; href: string; icon: TabIcon; label: string; center?: true }
  | { kind: "pending"; href: string };

export function tabSlots(
  role: string | null | undefined,
  roleKnown: boolean,
  menu: readonly NavGroup[] = MENU,
): TabSlot[] {
  return TABS.flatMap((tab): TabSlot[] => {
    const item = menuItem(tab.href, menu);
    if (!item) return [];
    if (allowed(tab.href, role, menu)) return [{ kind: "tab", ...tab, label: item.label }];
    return !roleKnown && item.ability ? [{ kind: "pending", href: tab.href }] : [];
  });
}

/** On a phone the ☰ menu leaves out what the bottom bar already shows —
 *  worked out from the same filter, so the two can never disagree. */
export function hrefsOnTabBar(role: string | null | undefined): Set<string> {
  return new Set(visibleTabs(role).map((tab) => tab.href));
}

export function visibleHomeTasks(role: string | null | undefined): NavItem[] {
  return HOME_TASKS.filter((href) => allowed(href, role)).map((href) => menuItem(href)!);
}

/** The tab a page belongs to: the page itself, or the nearest parent that is
 *  a tab. Home counts only on the home page — every page has it as an
 *  ancestor, so it would otherwise be lit everywhere. */
export function currentTab(pathname: string): string | null {
  const chain = ancestry(pathname);
  if (chain[0] === "/") return "/";
  return chain.find((href) => href !== "/" && TABS.some((tab) => tab.href === href)) ?? null;
}
