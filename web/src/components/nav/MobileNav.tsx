"use client";

import { useEffect, useRef, useState } from "react";

import { AppNav, type NavGroup } from "@/components/nav/AppNav";
import { Button } from "@/components/ui/button";
import { useStore } from "@/lib/store/store-provider";

/** Navigation for a phone.
 *
 *  Before this existed the sidebar was simply hidden below the `sm` breakpoint
 *  with nothing in its place, so a phone showed zero links: whichever page you
 *  opened, you stayed on it. This is the replacement.
 *
 *  D34 shapes every choice here. The opener says "เมนู" in words next to the
 *  icon, because an older user should not have to know that three lines mean a
 *  menu. The panel fills the screen, its rows are large, and it closes with a
 *  labelled button rather than only a stray tap outside.
 */
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

  return (
    <div className="sm:hidden">
      <Button
        type="button"
        variant="outline"
        onClick={() => setOpen(true)}
        aria-expanded={open}
        aria-haspopup="dialog"
        className="min-h-11 gap-2 px-3"
      >
        <span aria-hidden="true">☰</span>
        เมนู
      </Button>

      {open ? (
        <MobilePanel
          groups={groups}
          role={role}
          userId={userId}
          pathname={pathname}
          onClose={() => setOpen(false)}
        />
      ) : null}
    </div>
  );
}

/** Mounted only while open, so it always starts closed and never holds a
 *  stale scroll position or focus from last time. */
function MobilePanel({
  groups,
  role,
  userId,
  pathname,
  onClose,
}: {
  groups: readonly NavGroup[];
  role: string | null | undefined;
  userId: string | null | undefined;
  pathname: string;
  onClose: () => void;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  // Read inside the panel rather than taking it as a prop: the layout renders
  // StoreProvider, so it cannot read the store itself.
  const { store } = useStore();
  const storeName = store?.name?.trim() || null;

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
      role="dialog"
      aria-modal="true"
      aria-label="เมนูหลัก"
      tabIndex={-1}
      className="fixed inset-0 z-50 flex flex-col bg-white outline-none"
    >
      <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-4 py-3">
        <p className="min-w-0 truncate text-base font-semibold text-slate-900">
          {storeName ?? "เมนู"}
        </p>
        <Button type="button" variant="outline" onClick={onClose} className="min-h-11 px-4">
          ปิด
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto p-3">
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
