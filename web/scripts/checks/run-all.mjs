/** Runs every permanent behaviour check. Any failure fails the whole run. */

import { readdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const checks = readdirSync(here).filter((name) => name.endsWith(".check.mjs")).sort();

let failed = 0;
for (const name of checks) {
  const result = spawnSync(process.execPath, [join(here, name)], { stdio: "inherit" });
  if (result.status !== 0) failed += 1;
}

console.log(`\n${checks.length - failed}/${checks.length} checks passed`);
process.exit(failed ? 1 : 0);
