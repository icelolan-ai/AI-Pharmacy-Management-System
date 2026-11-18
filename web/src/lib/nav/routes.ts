import { MENU } from "@/lib/nav/menu";

/** Every page's place in the app: its title on a phone's top bar, and the
 *  page ← goes back to (D78).
 *
 *  ← goes to the PARENT, never to wherever the browser was before
 *  (history.back). From a sale's detail it returns to the sales history, not
 *  to whatever form happened to come first — and an older user can tell
 *  where it goes before pressing it.
 *
 *  Declared here and nowhere else. A page that is not listed has no ← at
 *  all, and nav-routes.check.mjs fails until it is listed. Pages in the menu
 *  take their title from the menu, so a label is never written twice.
 *
 *  `[id]` stands for one segment of the address.
 */

export type RouteInfo = { pattern: string; title: string; parent: string | null };

type Declared = { pattern: string; parent: string | null; title?: string };

const DECLARED: readonly Declared[] = [
  { pattern: "/", parent: null },
  { pattern: "/sell", parent: "/" },
  { pattern: "/stock", parent: "/" },
  { pattern: "/stock/[id]", parent: "/stock", title: "รายละเอียดยา" },
  { pattern: "/receiving", parent: "/" },
  { pattern: "/receiving/[id]", parent: "/receiving", title: "ใบรับสินค้า" },
  { pattern: "/scan", parent: "/" },
  { pattern: "/reports/low-stock", parent: "/" },
  { pattern: "/expiry", parent: "/" },
  { pattern: "/reports/expired", parent: "/" },
  { pattern: "/dashboard", parent: "/" },
  { pattern: "/reports/inventory-value", parent: "/" },
  { pattern: "/history/sales", parent: "/" },
  { pattern: "/history/sales/[id]", parent: "/history/sales", title: "รายละเอียดบิล" },
  { pattern: "/history/purchases", parent: "/" },
  { pattern: "/history/purchases/[id]", parent: "/history/purchases", title: "รายละเอียดใบรับสินค้า" },
  { pattern: "/audit", parent: "/" },
  { pattern: "/suppliers", parent: "/" },
  { pattern: "/suppliers/[id]", parent: "/suppliers", title: "รายละเอียดผู้จำหน่าย" },
  { pattern: "/settings/store", parent: "/" },
  { pattern: "/store-map", parent: "/" },
  { pattern: "/me", parent: "/" },
  { pattern: "/settings/display", parent: "/" },
];

function menuLabel(href: string): string | undefined {
  for (const group of MENU) {
    const item = group.items.find((entry) => entry.href === href);
    if (item) return item.label;
  }
  return undefined;
}

export const ROUTES: readonly RouteInfo[] = DECLARED.map((route) => ({
  pattern: route.pattern,
  parent: route.parent,
  title: route.title ?? menuLabel(route.pattern) ?? route.pattern,
}));

function matches(pattern: string, pathname: string): boolean {
  const want = pattern.split("/").filter(Boolean);
  const have = pathname.split("/").filter(Boolean);
  return want.length === have.length && want.every((part, i) => part === "[id]" ? have[i] !== "" : part === have[i]);
}

/** The route a path belongs to. A fixed address beats a pattern, so
 *  /history/sales is never mistaken for /history/[id]. */
export function routeFor(pathname: string): RouteInfo | null {
  const path = pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;
  return (
    ROUTES.find((route) => route.pattern === path) ??
    ROUTES.find((route) => route.pattern.includes("[") && matches(route.pattern, path)) ??
    null
  );
}

/** Where ← goes from this path, or null for the home page and unknown pages. */
export function parentHref(pathname: string): string | null {
  return routeFor(pathname)?.parent ?? null;
}

/** This path and every parent above it, nearest first, ending at "/". */
export function ancestry(pathname: string): string[] {
  const chain: string[] = [];
  let current: string | null = routeFor(pathname)?.pattern ?? null;
  while (current !== null && !chain.includes(current)) {
    chain.push(current);
    current = routeFor(current)?.parent ?? null;
  }
  return chain;
}
