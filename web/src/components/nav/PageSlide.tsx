"use client";

/** Every page inside one opaque surface — and no slide any more.
 *
 *  D78-6 slid pages in and out with the browser's View Transitions and
 *  React's <ViewTransition>. On the owner's iPhone (video, 19 Nov) Safari
 *  still drew the old page faintly behind the new one, under a grey sheet,
 *  and squashed the tab bar's icons mid-change — after two rounds of fixes.
 *  As agreed with Chat A for exactly this case, the slide is off: every
 *  navigation changes the page at once, like a tab switch already did.
 *
 *  The surface stays opaque with the app's own colour (page-surface).
 *  The `pathname` prop is kept so the layout's call does not change.
 */
export function PageSlide({ children }: { pathname: string; children: React.ReactNode }) {
  return <div className="page-surface">{children}</div>;
}
