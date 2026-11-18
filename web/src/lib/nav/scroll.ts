/** Where a page starts when it is shown (D78 round 3).
 *
 *  The bug, from the owner's iPhone: "กดเมนูอื่น หน้าจอเลื่อน". Next.js keeps
 *  the old scroll position when the new page's top edge is still anywhere in
 *  the viewport (layout-router: "If the element's top edge is already in the
 *  viewport, exit early"). Our page starts under a sticky top bar, which
 *  Next does not count — so a page opened from one scrolled down a little
 *  started scrolled down too, its heading cut in half under the bar. Measured
 *  at 375px: คลังยา at 40 → รับสินค้า opened at 40; at 134 → opened at 134.
 *
 *  An iOS app instead:
 *  - a new page (a tab, a home button, a link) starts at the top, always;
 *  - ← back to the parent returns to where the parent was left;
 *  - the browser's own back (and the iPhone's swipe back) does the same;
 *  - tapping the tab you are already on scrolls back to the top.
 *
 *  This file decides; components/nav/PageScroll.tsx does the scrolling.
 */
export class ScrollMemory {
  private readonly saved = new Map<string, number>();
  private returning: string | null = null;

  /** The page at `path` is scrolled to `y` (called as the person scrolls). */
  remember(path: string, y: number): void {
    this.saved.set(path, Math.max(0, Math.round(y)));
  }

  /** The next page shown is `path`, reached by going back — ← or the
   *  browser's back — so it may return to where it was left. */
  returnTo(path: string): void {
    this.returning = path;
  }

  /** `path` has just been shown: the scroll position it starts at. 0 unless
   *  it was reached by going back to it, and then where it was left. */
  arrive(path: string): number {
    const back = this.returning === path;
    this.returning = null;
    return back ? (this.saved.get(path) ?? 0) : 0;
  }
}

/** One memory for the whole app: the page that saves a position and the
 *  ← that asks for it are in different components. */
export const scrollMemory = new ScrollMemory();

/** A tap on the bottom bar's tab for the page already on screen scrolls to
 *  the top instead of loading the same page again — as in an iOS app. On a
 *  page below the tab (a drug's details under คลังยา) the tab still goes to
 *  the tab's own page. */
export function tapScrollsToTop(pathname: string, tabHref: string): boolean {
  return pathname === tabHref;
}
