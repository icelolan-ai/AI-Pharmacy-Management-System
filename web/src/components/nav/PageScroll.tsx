"use client";

import { useEffect, useLayoutEffect, useRef } from "react";

import { scrollMemory } from "@/lib/nav/scroll";

/** Puts each page at the scroll position lib/nav/scroll.ts decides (D78
 *  round 3). Rendered after <main> in the app layout, so its layout effect
 *  runs after Next.js's own scroll handling for the new page and has the
 *  last word, before the screen is painted.
 *
 *  Going back to a page whose list loads after it appears: the page is
 *  still short at first, so the position is tried again as it grows — until
 *  it is reached, the person touches the screen, or 3 seconds pass.
 */
const GIVE_UP_MS = 3000;

export function PageScroll({ pathname }: { pathname: string }) {
  const shown = useRef(pathname);

  useEffect(() => {
    const onScroll = () => scrollMemory.remember(shown.current, window.scrollY);
    // The browser's back and the iPhone's swipe back: location is already
    // the page being returned to when this fires.
    const onPopState = () => scrollMemory.returnTo(window.location.pathname);
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("popstate", onPopState);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("popstate", onPopState);
    };
  }, []);

  useLayoutEffect(() => {
    if (shown.current === pathname) return;
    shown.current = pathname;
    const target = scrollMemory.arrive(pathname);
    window.scrollTo({ top: target, behavior: "instant" });
    if (target === 0 || Math.abs(window.scrollY - target) <= 1) return;

    const stop = () => {
      grow.disconnect();
      clearTimeout(timer);
      for (const type of ["pointerdown", "wheel", "keydown", "touchstart"]) window.removeEventListener(type, stop);
    };
    const grow = new ResizeObserver(() => {
      window.scrollTo({ top: target, behavior: "instant" });
      if (Math.abs(window.scrollY - target) <= 1) stop();
    });
    grow.observe(document.body);
    const timer = setTimeout(stop, GIVE_UP_MS);
    for (const type of ["pointerdown", "wheel", "keydown", "touchstart"]) window.addEventListener(type, stop, { passive: true });
    return stop;
  }, [pathname]);

  return null;
}
