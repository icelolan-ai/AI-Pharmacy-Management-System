"use client";

import Link from "next/link";
import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";
import { Boxes, ChevronLeft, House, Menu, PackagePlus, ShoppingCart, X, type LucideIcon } from "lucide-react";

import { AppNav } from "@/components/nav/AppNav";
import { Button } from "@/components/ui/button";
import type { NavGroup } from "@/lib/nav/items";
import { currentTab, hrefsOnTabBar, tabSlots, type TabIcon } from "@/lib/nav/tabs";
import { scrollMemory, tapScrollsToTop } from "@/lib/nav/scroll";
import { getLargeTitle, subscribeLargeTitle } from "@/lib/nav/large-title";
import { roleLabel } from "@/lib/roles";
import { useStore } from "@/lib/store/store-provider";

/** Navigation for a phone: the bar along the bottom (D78).
 *
 *  Before U-4 a phone showed zero links; D47-3 then put the menu behind the
 *  shop's name in the top corner. D78 moves it to where a thumb already is:
 *  หน้าแรก · ขาย · รับของ · สต็อก · เมนู along the bottom, like an iPhone app.
 *
 *  The tabs come from the menu's own entries and the menu's own permission
 *  filter (lib/nav/tabs.ts) — a role that may not receive stock has no รับของ
 *  tab, and the bar simply has fewer buttons.
 *
 *  ☰ เมนู opens the same menu as before, with every folding group of D47.
 *  It is the one control for the menu: the bar stays on top of the open
 *  panel, and the same button, now ✕, closes it. Escape closes it, and so
 *  does following a link. Who is signed in, and signing out, live in the
 *  panel now, not in the crowded top bar.
 *
 *  D34: every tab has an icon AND a word. The tab a person is on is bold and
 *  underlined as well as raised — never shown by motion or colour alone,
 *  because motion can be switched off.
 */
const PANEL_ID = "main-menu-panel";

const ICONS: Record<TabIcon, LucideIcon> = {
  home: House,
  sell: ShoppingCart,
  receive: PackagePlus,
  stock: Boxes,
};

type Signed = {
  name: string | null;
  role: string | null | undefined;
  profileError: string | null;
  profileLoading: boolean;
  onRetry: () => void;
  onSignOut: () => void;
};

export function MobileNav({
  groups,
  role,
  roleKnown,
  userId,
  pathname,
  signed,
}: {
  groups: readonly NavGroup[];
  role: string | null | undefined;
  /** The profile has loaded, so `role` is the answer, not "not yet". */
  roleKnown: boolean;
  userId: string | null | undefined;
  pathname: string;
  signed: Signed;
}) {
  const [open, setOpen] = useState(false);
  const current = currentTab(pathname);

  return (
    <div className="sm:hidden">
      {open ? (
        <MobilePanel groups={groups} role={role} userId={userId} pathname={pathname} signed={signed} onClose={() => setOpen(false)} />
      ) : null}

      <nav aria-label="แถบนำทางหลัก" className="glass-bar tab-bar fixed inset-x-0 bottom-0 z-[60]">
        <ul className="flex items-stretch">
          {tabSlots(role, roleKnown).map((tab) => {
            if (tab.kind === "pending") {
              // Held for a tab that may or may not be allowed: empty, and
              // nothing in it to press or to read out.
              return <li key={tab.href} aria-hidden="true" data-pending="" className="flex flex-1" />;
            }
            const Icon = ICONS[tab.icon];
            const here = !open && current === tab.href;
            return (
              <li key={tab.href} className="flex flex-1">
                <Link
                  href={tab.href}
                  aria-current={here ? "page" : undefined}
                  onClick={(event) => {
                    setOpen(false);
                    // The tab for the page on screen: back to the top, as in
                    // an iOS app — not the same page loaded again.
                    if (tapScrollsToTop(pathname, tab.href)) {
                      event.preventDefault();
                      const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
                      window.scrollTo({ top: 0, behavior: still ? "instant" : "smooth" });
                    }
                  }}
                  className="tab-item"
                  data-center={tab.center ? "" : undefined}
                >
                  {/* D82: ขายยา is a raised disc — still with its word under
                      it, never an icon alone (D34). */}
                  {tab.center ? (
                    <span className="tab-center-disc">
                      <Icon aria-hidden="true" className="tab-icon" strokeWidth={2.5} />
                    </span>
                  ) : (
                    <Icon aria-hidden="true" className="tab-icon" strokeWidth={2.25} />
                  )}
                  <span className="tab-label">{tab.label}</span>
                </Link>
              </li>
            );
          })}
          <li className="flex flex-1">
            <button
              type="button"
              onClick={() => setOpen((wasOpen) => !wasOpen)}
              aria-expanded={open}
              aria-controls={PANEL_ID}
              aria-label={open ? "ปิดเมนูหลัก" : "เปิดเมนูหลัก"}
              data-open={open || undefined}
              className="tab-item"
            >
              {open ? (
                <X aria-hidden="true" className="tab-icon" strokeWidth={2.25} />
              ) : (
                <Menu aria-hidden="true" className="tab-icon" strokeWidth={2.25} />
              )}
              <span className="tab-label">เมนู</span>
            </button>
          </li>
        </ul>
      </nav>
    </div>
  );
}

/** The menu as an iOS sheet (D78 round 2). Mounted only while open, so it
 *  always starts closed and never holds a stale scroll position or focus.
 *
 *  It rises from the bottom and stops on top of the tab bar, which stays in
 *  view — its ✕ closes it, the one control D47-3 asked for. Tapping the dim
 *  page above it closes it, and so does dragging it down by its top past
 *  DISMISS_PX, or Escape. It lists only what the bottom bar does not show.
 */
const DISMISS_PX = 80;

function MobilePanel({
  groups,
  role,
  userId,
  pathname,
  signed,
  onClose,
}: {
  groups: readonly NavGroup[];
  role: string | null | undefined;
  userId: string | null | undefined;
  pathname: string;
  signed: Signed;
  onClose: () => void;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const { store } = useStore();
  const storeName = store?.name?.trim() || null;
  const [drag, setDrag] = useState<{ startY: number; dy: number } | null>(null);

  useEffect(() => {
    panelRef.current?.focus();
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  return (
    <>
      <div aria-hidden="true" className="menu-backdrop" onClick={onClose} />
      <div
        ref={panelRef}
        id={PANEL_ID}
        role="dialog"
        aria-modal="true"
        aria-label="เมนูหลัก"
        tabIndex={-1}
        className="menu-sheet flex flex-col outline-none"
        data-dragging={drag ? "" : undefined}
        style={{ "--sheet-drag": `${drag?.dy ?? 0}px` } as React.CSSProperties}
      >
        {/* The grab area: drag down to put the sheet away. */}
        <div
          className="sheet-grab"
          onPointerDown={(event) => {
            event.currentTarget.setPointerCapture(event.pointerId);
            setDrag({ startY: event.clientY, dy: 0 });
          }}
          onPointerMove={(event) =>
            setDrag((current) => (current ? { ...current, dy: Math.max(0, event.clientY - current.startY) } : current))
          }
          onPointerUp={() => {
            if (drag && drag.dy > DISMISS_PX) onClose();
            setDrag(null);
          }}
          onPointerCancel={() => setDrag(null)}
        >
          <span aria-hidden="true" className="sheet-handle" />
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto px-4 pb-4">
          <div className="menu-group space-y-3 p-4">
            {storeName ? <p className="text-base font-semibold text-slate-900">{storeName}</p> : null}
            {signed.profileError ? (
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-slate-900">โหลดข้อมูลผู้ใช้ไม่ได้</p>
                  <p className="text-xs text-slate-600">{signed.profileError}</p>
                </div>
                <Button variant="outline" size="sm" onClick={signed.onRetry} disabled={signed.profileLoading}>
                  {signed.profileLoading ? "กำลังลองใหม่..." : "ลองใหม่"}
                </Button>
              </div>
            ) : (
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-slate-900">{signed.name ?? "ผู้ใช้"}</p>
                  <p className="text-xs text-slate-600">{signed.role ? roleLabel(signed.role) : "กำลังโหลดสิทธิ์..."}</p>
                </div>
                <Button variant="outline" size="sm" onClick={signed.onSignOut}>
                  ออกจากระบบ
                </Button>
              </div>
            )}
          </div>

          <AppNav
            groups={groups}
            role={role}
            userId={userId}
            pathname={pathname}
            variant="panel"
            onNavigate={onClose}
            exclude={hrefsOnTabBar(role)}
          />
        </div>
      </div>
    </>
  );
}

/** The phone's top bar: ← to the parent page, and this page's name (D78).
 *  ← carries the parent's name in words beside the arrow (D34), and is a
 *  plain link to that page — never history.back. Home has no ←; there it
 *  says the shop's name, as text, not as a button (D47-3 revised). */
export function MobileTopBar({
  title,
  parent,
}: {
  title: string;
  parent: { href: string; title: string } | null;
}) {
  const largeTitle = useSyncExternalStore(subscribeLargeTitle, getLargeTitle, () => null);
  const [titleBelow, setTitleBelow] = useState(false);
  // Layout effect: the first state is decided before the page is painted,
  // so the bar's title never shows for a moment and then fades away.
  useLayoutEffect(() => {
    if (!largeTitle) {
      setTitleBelow(false);
      return;
    }
    const bar = document.querySelector<HTMLElement>("header.top-bar");
    const box = largeTitle.getBoundingClientRect();
    setTitleBelow(box.top >= (bar?.offsetHeight ?? 52) && box.bottom <= window.innerHeight);
    const watch = new IntersectionObserver(
      // Whole and below the bar: the bar's own title stays hidden. As soon
      // as any of it slides under the bar, the bar's title appears (iOS).
      ([entry]) => setTitleBelow(entry.intersectionRatio >= 0.99),
      { rootMargin: `-${bar?.offsetHeight ?? 52}px 0px 0px 0px`, threshold: [0, 0.99] },
    );
    watch.observe(largeTitle);
    return () => watch.disconnect();
  }, [largeTitle]);

  return (
    <header
      className="glass-bar top-bar sticky top-0 z-40 flex items-center gap-2 px-2 sm:hidden"
      data-title-below={titleBelow ? "" : undefined}
    >
      {parent ? (
        <Link
          href={parent.href}
          onClick={() => scrollMemory.returnTo(parent.href)}
          aria-label={`กลับไปหน้า${parent.title}`}
          className="back-link"
        >
          {/* D82: ← in a rounded square; the parent's name stays beside it. */}
          <span aria-hidden="true" className="back-box">
            <ChevronLeft className="size-6" />
          </span>
          <span className="truncate">{parent.title}</span>
        </Link>
      ) : null}
      {/* Text, not a heading: every page carries its own <h1>. Hidden while
          the page's large title is still on screen (D82), shown once it has
          scrolled under the bar. */}
      <p className="top-bar-title min-w-0 flex-1 truncate px-2 text-base font-semibold text-slate-900">{title}</p>
    </header>
  );
}
