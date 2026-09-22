/** Shared helpers for the permanent behaviour checks.
 *
 *  These checks exist because the behaviours they guard were each a real bug
 *  or an explicit decision, and the project has no component test runner (no
 *  new libraries — docs/05-web-spec.md 5.0.12). Two kinds of check are used:
 *
 *  1. Logic checks — run real exported code, or a faithful model of a rule
 *     that only exists inside a React hook.
 *  2. Source invariants — assert that the code still has the shape the fix
 *     depends on. Coarse, but it catches a reintroduction of the exact bug.
 *
 *  Run them all with `npm run check`.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
export const SRC = join(here, "..", "..", "src");

export function source(relativePath) {
  return readFileSync(join(SRC, relativePath), "utf8");
}

export function createChecker(title) {
  let passed = 0;
  let failed = 0;
  console.log(`\n=== ${title} ===`);

  return {
    ok(label, condition, detail) {
      if (condition) {
        passed += 1;
        console.log(`PASS  ${label}`);
      } else {
        failed += 1;
        console.log(`FAIL  ${label}`);
        if (detail) console.log(`      ${detail}`);
      }
    },
    eq(label, got, want) {
      const same = JSON.stringify(got) === JSON.stringify(want);
      this.ok(label, same, same ? "" : `got ${JSON.stringify(got)} want ${JSON.stringify(want)}`);
    },
    done() {
      console.log(`${passed} passed, ${failed} failed`);
      return failed;
    },
  };
}
