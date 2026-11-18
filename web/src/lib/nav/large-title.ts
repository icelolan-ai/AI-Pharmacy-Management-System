/** The page's large title (D82), and whether it has scrolled out of view.
 *
 *  iOS shows a page's name large under the bar; once it scrolls away, the
 *  bar's own small title appears. PageHeader hands its large <h1> here; the
 *  top bar watches it with an IntersectionObserver and only switches the
 *  small title's opacity — nothing changes size or moves, so there is no
 *  layout for Safari to jump on while scrolling.
 *
 *  A page without a large title (a drug, a bill) leaves nothing here, and
 *  the bar's title simply stays.
 */
let current: HTMLElement | null = null;
const listeners = new Set<() => void>();

export function setLargeTitle(element: HTMLElement | null): void {
  if (current === element) return;
  current = element;
  for (const listener of listeners) listener();
}

export function subscribeLargeTitle(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getLargeTitle(): HTMLElement | null {
  return current;
}
