/** No CSS variable may point at itself, directly or round a loop (D80).
 *
 *  `--font-sans: var(--font-sans)` sat in globals.css from Phase 5.1 to the
 *  D78 walk-through. The browser raises no error and logs no warning for it:
 *  the variable is simply thrown away, and the whole app showed Times New
 *  Roman through every test, the Phase 5 gate and many looks by the user.
 *
 *  So every custom property declared in globals.css is followed through the
 *  var() references it uses, and none may come back to itself.
 *
 *  This proves the code. That the page really draws in the Thai font is a
 *  separate question — it was checked in the browser for D80, and a lasting
 *  automatic check needs a headless browser, which the project does not have
 *  (5.0.12: no new libraries) and is asked for, not assumed.
 */

import { createChecker, source } from "./lib.mjs";

const check = createChecker("ตัวแปร CSS ไม่ชี้หาตัวเอง (D80)");

const css = source("app/globals.css").replace(/\/\*[\s\S]*?\*\//g, "");
const uses = new Map(); // --name -> Set of --names its values use
let declared = 0;
for (const match of css.matchAll(/(--[\w-]+)\s*:\s*([^;{}]+);/g)) {
  declared += 1;
  const [, name, value] = match;
  const refs = uses.get(name) ?? new Set();
  for (const ref of value.matchAll(/var\(\s*(--[\w-]+)/g)) refs.add(ref[1]);
  uses.set(name, refs);
}
check.ok("อ่านตัวแปรใน globals.css ได้จริง", declared >= 20 && uses.has("--font-sans"), `declared ${declared}`);

function loopFrom(start) {
  const stack = [[start, [start]]];
  const seen = new Set();
  while (stack.length) {
    const [name, path] = stack.pop();
    for (const next of uses.get(name) ?? []) {
      if (next === start) return [...path, next];
      if (!seen.has(next)) {
        seen.add(next);
        stack.push([next, [...path, next]]);
      }
    }
  }
  return null;
}
const loops = [...uses.keys()].map(loopFrom).filter(Boolean).map((path) => path.join(" → "));
check.eq("🔴 ไม่มีตัวแปรไหนชี้กลับหาตัวเอง (ตรง ๆ หรือวนผ่านตัวอื่น)", loops, []);

process.exit(check.done() ? 1 : 0);
