/** The two colour themes (D71, made in D82).
 *
 *  ขาว is the app as it has always been; ฟ้า is the same app with other
 *  values for the same colour variables (globals.css, :root[data-theme=
 *  "blue"]) — sizes and layout never change with the theme.
 *
 *  A person picks อัตโนมัติ · ฟ้า · ขาว on การแสดงผล. The choice lives in
 *  this browser only (localStorage), never in the database. อัตโนมัติ means
 *  ฟ้า when the app was opened from its Home Screen icon, ขาว in a browser.
 *  What a person picks always beats อัตโนมัติ. A choice that cannot be read
 *  — storage blocked, a value from some older version — counts as
 *  อัตโนมัติ, never as a blank page.
 *
 *  The theme is set by THEME_BOOT, a script in the page's <head> that runs
 *  before the first paint, so the page never flashes white before turning
 *  blue. It is built from resolveTheme itself: one rule, not two copies.
 */
export type ThemeChoice = "auto" | "blue" | "white";
export type Theme = "blue" | "white";

export const THEME_KEY = "pharmacy.theme";

export const THEME_CHOICES: readonly { value: ThemeChoice; label: string; hint: string }[] = [
  { value: "auto", label: "อัตโนมัติ", hint: "ฟ้าเมื่อเปิดจากไอคอนบนหน้าจอโฮม · ขาวเมื่อเปิดในเบราว์เซอร์" },
  { value: "blue", label: "ฟ้า", hint: "ใช้ธีมฟ้าเสมอ บนเครื่องนี้" },
  { value: "white", label: "ขาว", hint: "ใช้ธีมขาวเสมอ บนเครื่องนี้" },
];

/** Anything but an explicit "blue" or "white" — nothing stored, junk, an
 *  error while reading — is อัตโนมัติ. Self-contained on purpose: THEME_BOOT
 *  inlines its source into the page. */
export function resolveTheme(stored: unknown, standalone: boolean): "blue" | "white" {
  if (stored === "blue" || stored === "white") return stored;
  return standalone ? "blue" : "white";
}

export function readChoice(): ThemeChoice {
  try {
    const stored = window.localStorage.getItem(THEME_KEY);
    return stored === "blue" || stored === "white" ? stored : "auto";
  } catch {
    return "auto";
  }
}

export function isStandalone(): boolean {
  try {
    return (
      window.matchMedia("(display-mode: standalone)").matches ||
      (window.navigator as Navigator & { standalone?: boolean }).standalone === true
    );
  } catch {
    return false;
  }
}

/** Applies a choice now and tries to remember it. false: this browser
 *  would not store it, so it holds until the page is closed. */
export function chooseTheme(choice: ThemeChoice): boolean {
  document.documentElement.dataset.theme = resolveTheme(choice, isStandalone());
  try {
    if (choice === "auto") window.localStorage.removeItem(THEME_KEY);
    else window.localStorage.setItem(THEME_KEY, choice);
    return true;
  } catch {
    return false;
  }
}

/** Runs in <head> before anything is drawn. Every step that can throw is
 *  caught, and the fallback is อัตโนมัติ. */
export const THEME_BOOT = `(function () {
  var stored = null;
  try { stored = window.localStorage.getItem(${JSON.stringify(THEME_KEY)}); } catch (e) {}
  var standalone = false;
  try {
    standalone = window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;
  } catch (e) {}
  var resolve = ${resolveTheme.toString()};
  document.documentElement.dataset.theme = resolve(stored, standalone);
})();`;
