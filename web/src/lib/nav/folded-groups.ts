"use client";

import { useCallback, useMemo, useSyncExternalStore } from "react";

import type { NavVariant } from "@/lib/nav/folding";

/** Which menu groups a person has moved away from their device's default
 *  (D43 · D47-2).
 *
 *  What is stored is the difference, not the state: on a wide screen every
 *  group is open unless it is in here, and on a phone every group is folded
 *  unless it is in here. An untouched menu therefore stores nothing at all,
 *  and the two devices keep separate keys — folding a group on the phone must
 *  not fold it on the shop computer, because the reason for folding it (a
 *  short screen) does not apply there.
 *
 *  Kept in localStorage per D38: a convenience belonging to one person on one
 *  machine, so it needs no migration and no endpoint. Every read and write is
 *  wrapped — a browser with storage switched off must still show a working
 *  menu, and the fallback is the device default, never everything hidden.
 *
 *  Read through useSyncExternalStore rather than an effect. Storage does not
 *  exist while the page is rendered on the server, and setting state after
 *  mount to catch up would both flash the wrong menu and put state back into
 *  an effect, which this codebase spent a whole cleanup removing.
 */

const PREFIX = "pharmacy.nav.folded.";

const listeners = new Set<() => void>();

function storageKey(userId: string | null | undefined, variant: NavVariant): string {
  return `${PREFIX}${variant}.${userId ?? "anonymous"}`;
}

function readRaw(userId: string | null | undefined, variant: NavVariant): string | null {
  try {
    return window.localStorage.getItem(storageKey(userId, variant));
  } catch {
    // Private mode, blocked site data, or an embedded browser: behave as if
    // nothing had ever been changed from the default.
    return null;
  }
}

function writeRaw(
  userId: string | null | undefined,
  variant: NavVariant,
  headings: string[],
): void {
  try {
    if (headings.length === 0) window.localStorage.removeItem(storageKey(userId, variant));
    else window.localStorage.setItem(storageKey(userId, variant), JSON.stringify(headings));
  } catch {
    // Nothing to do: the menu still works, it just will not remember.
  }
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  // Another tab folding a group should be reflected here too.
  window.addEventListener("storage", listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", listener);
  };
}

/** Anything unreadable — not JSON, not an array — counts as no exceptions,
 *  which leaves every group at its device default. */
export function parseExceptions(raw: string | null): ReadonlySet<string> {
  if (!raw) return new Set();
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed.filter((entry): entry is string => typeof entry === "string"));
  } catch {
    return new Set();
  }
}

/** Pure form of the toggle, so a check can run it rather than read it. */
export function toggledExceptions(
  exceptions: ReadonlySet<string>,
  heading: string,
): string[] {
  const next = new Set(exceptions);
  if (next.has(heading)) next.delete(heading);
  else next.add(heading);
  return [...next];
}

export function useFoldedGroups(userId: string | null | undefined, variant: NavVariant) {
  const raw = useSyncExternalStore(
    subscribe,
    () => readRaw(userId, variant),
    // On the server there is no storage, so the first paint uses the device
    // default — which is also what a first visit should show.
    () => null,
  );

  const exceptions = useMemo(() => parseExceptions(raw), [raw]);

  const toggle = useCallback(
    (heading: string) => {
      // Re-read rather than trusting the rendered value: two menus are mounted
      // at once on a wide phone, and the other one may have written since.
      const current = parseExceptions(readRaw(userId, variant));
      writeRaw(userId, variant, toggledExceptions(current, heading));
    },
    [userId, variant],
  );

  return { exceptions, toggle };
}
