"use client";

import { ViewTransition } from "react";

/** iPhone-style page slides (D78), with the browser's View Transitions and
 *  React's <ViewTransition> — no animation library.
 *
 *  Only navigations that say which way they go slide: "nav-forward" (the
 *  home page's big buttons — a page slides in from the right) and
 *  "nav-back" (← — the page slides away to the right). Everything else —
 *  the bottom tabs, the menu, the browser's own back — changes instantly,
 *  as before. A browser without View Transitions changes instantly too.
 *
 *  Keyed by the path, so each page enters and leaves as a whole. The CSS is
 *  in globals.css, under 300ms, and off entirely under reduced motion.
 */
const SLIDE = { "nav-forward": "nav-forward", "nav-back": "nav-back", default: "none" } as const;

export function PageSlide({ pathname, children }: { pathname: string; children: React.ReactNode }) {
  return (
    <ViewTransition key={pathname} enter={SLIDE} exit={SLIDE} default="none">
      {children}
    </ViewTransition>
  );
}
