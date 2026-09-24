"use client";

import { useEffect, useRef, useState } from "react";

import { AppNav, type NavGroup } from "@/components/nav/AppNav";
import { useStore } from "@/lib/store/store-provider";

/** Navigation for a phone.
 *
 *  Before this existed the sidebar was simply hidden below the `sm` breakpoint
 *  with nothing in its place, so a phone showed zero links: whichever page you
 *  opened, you stayed on it. This is the replacement.
 *
 *  D47-3 makes the shop's name the control. One button in one place: it says
 *  the shop's name, it opens the menu, and pressing it again closes it. The
 *  separate "ปิด" button on the far side of the panel is gone — two controls
 *  for one thing, in two different corners, is what made it feel like a trap.
 *
 *  D34 shapes the rest. The button carries ☰ beside the name so it still reads
 *  as a menu rather than as a title, its accessible name says so in words, and
 *  the panel's rows are large. Escape closes it, and so does following a link.
 */
const PANEL_ID = "main-menu-panel";

export function MobileNav({
  groups,
  role,
  userId,
  pathname,
}: {
  groups: readonly NavGroup[];
  role: string | null | undefined;
  userId: string | null | undefined;
  pathname: string;
}) {
  const [open, setOpen] = useState(false);
  const { store } = useStore();
  const storeName = store?.name?.trim() || null;

  return (
    <div className="sm:hidden">
      <StoreNameButton
        open={open}
        storeName={storeName}
        onClick={() => setOpen((wasOpen) => !wasOpen)}
      />

      {open ? (
        <MobilePanel
          groups={groups}
          role={role}
          userId={userId}
          pathname={pathname}
          storeName={storeName}
          onClose={() => setOpen(false)}
        />
      ) : null}
    </div>
  );
}

/** The one control. It looks and reads the same whether the menu is open or
 *  shut, because it is the same button doing the opposite thing. */
function StoreNameButton({
  open,
  storeName,
  onClick,
}: {
  open: boolean;
  storeName: string | null;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-expanded={open}
      aria-controls={PANEL_ID}
      // The accessible name says what it does; the visible text says whose
      // shop it is. Both are needed (D34 · D47-3).
      aria-label={open ? "ปิดเมนูหลัก" : "เปิดเมนูหลัก"}
      className="flex min-h-12 max-w-[11rem] items-center gap-2 rounded-md border border-slate-300 px-3 py-2 text-left text-base font-semibold text-slate-900 hover:bg-slate-100"
    >
      <span aria-hidden="true" className="shrink-0 text-lg">
        {open ? "✕" : "☰"}
      </span>
      <span className="truncate">{storeName ?? "เมนู"}</span>
    </button>
  );
}

/** Mounted only while open, so it always starts closed and never holds a
 *  stale scroll position or focus from last time. */
function MobilePanel({
  groups,
  role,
  userId,
  pathname,
  storeName,
  onClose,
}: {
  groups: readonly NavGroup[];
  role: string | null | undefined;
  userId: string | null | undefined;
  pathname: string;
  storeName: string | null;
  onClose: () => void;
}) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    panelRef.current?.focus();
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  return (
    <div
      ref={panelRef}
      id={PANEL_ID}
      role="dialog"
      aria-modal="true"
      aria-label="เมนูหลัก"
      tabIndex={-1}
      className="fixed inset-0 z-50 flex flex-col bg-white outline-none"
    >
      {/* The same button, in the same corner, now closing what it opened. */}
      <div className="border-b border-slate-200 px-4 py-3">
        <StoreNameButton open storeName={storeName} onClick={onClose} />
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        <AppNav
          groups={groups}
          role={role}
          userId={userId}
          pathname={pathname}
          variant="panel"
          onNavigate={onClose}
        />
      </div>
    </div>
  );
}
