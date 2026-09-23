"use client";

import { useCallback, useMemo, useSyncExternalStore } from "react";

/** Which menu groups a person has folded away (D43).
 *
 *  Kept in localStorage per D38: it is a convenience belonging to one person
 *  on one machine, not shop data, so it needs no migration and no endpoint.
 *  Every read and write is wrapped — a browser with storage switched off must
 *  still show a working menu, and the fallback is every group open, never
 *  every group hidden.
 *
 *  Read through useSyncExternalStore rather than an effect. Storage does not
 *  exist while the page is rendered on the server, and setting state after
 *  mount to catch up would both flash the wrong menu and put state back into
 *  an effect, which this codebase spent a whole cleanup removing.
 */

const PREFIX = "pharmacy.nav.collapsed.";

const listeners = new Set<() => void>();

function storageKey(userId: string | null | undefined): string {
  return PREFIX + (userId ?? "anonymous");
}

function readRaw(userId: string | null | undefined): string | null {
  try {
    return window.localStorage.getItem(storageKey(userId));
  } catch {
    // Private mode, blocked site data, or an embedded browser: behave as if
    // nothing was ever folded.
    return null;
  }
}

function writeRaw(userId: string | null | undefined, headings: string[]): void {
  try {
    if (headings.length === 0) window.localStorage.removeItem(storageKey(userId));
    else window.localStorage.setItem(storageKey(userId), JSON.stringify(headings));
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

/** Anything unreadable — not JSON, not an array — counts as nothing folded. */
export function parseCollapsed(raw: string | null): ReadonlySet<string> {
  if (!raw) return new Set();
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed.filter((entry): entry is string => typeof entry === "string"));
  } catch {
    return new Set();
  }
}

export function useCollapsedGroups(userId: string | null | undefined) {
  const raw = useSyncExternalStore(
    subscribe,
    () => readRaw(userId),
    // On the server there is no storage, so the first paint shows every group
    // open — which is also what D43 asks for on a first visit.
    () => null,
  );

  const collapsed = useMemo(() => parseCollapsed(raw), [raw]);

  const toggle = useCallback(
    (heading: string) => {
      const next = new Set(parseCollapsed(readRaw(userId)));
      if (next.has(heading)) next.delete(heading);
      else next.add(heading);
      writeRaw(userId, [...next]);
    },
    [userId],
  );

  return { collapsed, toggle };
}
