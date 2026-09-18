"use client";

import { useEffect } from "react";

const CONFIRM_MESSAGE = "ยังไม่ได้บันทึกการแก้ไข ต้องการออกจากหน้านี้หรือไม่?";

/** Asks before the user walks away from unsaved edits.
 *
 *  Covers both ways out: closing/reloading the tab (the browser's own prompt)
 *  and clicking a link inside the app (App Router has no navigation-blocking
 *  API, so the click is intercepted before Next handles it).
 */
export function useUnsavedChangesWarning(dirty: boolean) {
  useEffect(() => {
    if (!dirty) return;

    function onBeforeUnload(event: BeforeUnloadEvent) {
      event.preventDefault();
      event.returnValue = "";
    }

    function onClickCapture(event: MouseEvent) {
      if (event.defaultPrevented || event.button !== 0) return;
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;

      const link = (event.target as Element | null)?.closest?.("a[href]");
      if (!(link instanceof HTMLAnchorElement)) return;
      if (link.target && link.target !== "_self") return;
      if (link.href === window.location.href) return;
      if (new URL(link.href).origin !== window.location.origin) return;

      if (!window.confirm(CONFIRM_MESSAGE)) {
        event.preventDefault();
        event.stopPropagation();
      }
    }

    window.addEventListener("beforeunload", onBeforeUnload);
    document.addEventListener("click", onClickCapture, true);
    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload);
      document.removeEventListener("click", onClickCapture, true);
    };
  }, [dirty]);
}
