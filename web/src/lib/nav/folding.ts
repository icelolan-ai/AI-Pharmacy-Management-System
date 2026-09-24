/** Whether a menu group is showing its links, and what a tap on its heading
 *  does (D43 · D47).
 *
 *  This lived inline in AppNav, where a check could read its spelling but
 *  never run it. That is how D47-1 got in: every assertion about folding
 *  confirmed the shape of the code, and not one of them ever opened a group,
 *  shut it, and looked at what happened (D43-a).
 */

export type NavVariant = "sidebar" | "panel";

/** What an untouched group looks like on each device.
 *
 *  D47-2 splits them. On a wide screen every group is open, the way D43 left
 *  it. On a phone they all start folded: fifteen links opened at once is the
 *  clutter D43 set out to fix, and a phone has no room to scroll past it.
 */
export function opensByDefault(variant: NavVariant): boolean {
  return variant === "sidebar";
}

/** Is this group showing its links?
 *
 *  `exceptions` holds the headings the person has changed away from the
 *  device's default — folded ones on a wide screen, opened ones on a phone.
 *  Storing the differences rather than the state means an untouched menu
 *  follows the device rule with nothing stored at all.
 *
 *  D47-1: the group holding the current page is no longer forced open. It
 *  opens by default, which is what a person wants when they arrive, but a tap
 *  on its heading folds it like any other. Forcing it open left a heading that
 *  did nothing when pressed, and that reads as a broken button rather than as
 *  a rule (D34).
 */
export function isGroupOpen({
  heading,
  holdsCurrentPage,
  exceptions,
  variant,
}: {
  /** null for the everyday block at the top, which never folds (D43). */
  heading: string | null;
  holdsCurrentPage: boolean;
  exceptions: ReadonlySet<string>;
  variant: NavVariant;
}): boolean {
  if (heading === null) return true;
  // Arriving on a page inside a group opens it, so nobody has to go looking
  // for where they already are. That is a default, not an override: it moves
  // what a press starts from, and a press still reverses it. Making it an
  // override was the first draft, and it left the heading of the group you
  // were standing in unable to fold — the same dead button in a new place.
  const startsOpen = opensByDefault(variant) || holdsCurrentPage;
  return exceptions.has(heading) ? !startsOpen : startsOpen;
}

/** The heading a person may press. Only the everyday block has none. */
export function isFoldable(heading: string | null): boolean {
  return heading !== null;
}
