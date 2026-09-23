/** D35: กราฟทุกตัววาดด้วย inline SVG เอง ห้ามเพิ่ม dependency สำหรับกราฟ
 *
 *  Two written rules already forbid this, and one of them fails the whole
 *  gate on contact: 05-web-spec.md 5.0.12 lists "Library กราฟ" among the
 *  packages banned outright, and item 45 of the closing checklist says any
 *  dependency outside 5.0.12 is an immediate fail.
 *
 *  A chart library is the easiest of those rules to break by accident,
 *  because reaching for one is the normal way to draw a chart and nothing
 *  else in the build would complain. So it is checked here rather than left
 *  to whoever reads the checklist last.
 */

import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { createChecker, SRC } from "./lib.mjs";

const check = createChecker("D35 — ห้ามมี library กราฟ");

const WEB = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const manifest = JSON.parse(readFileSync(join(WEB, "package.json"), "utf8"));

/** Named by Chat A, plus the spellings each one also publishes under. */
const BANNED = [
  "recharts",
  "chart.js",
  "d3",
  "victory",
  "nivo",
  "apexcharts",
  "plotly",
  "echarts",
];

const installed = [
  ...Object.keys(manifest.dependencies ?? {}),
  ...Object.keys(manifest.devDependencies ?? {}),
];

check.ok("อ่าน package.json ได้จริง", installed.length > 0, `found ${installed.length} packages`);

/** Matching a package name is fiddlier than it looks, and getting it wrong in
 *  either direction is bad: too loose and an innocent package fails the gate,
 *  too tight and the ban is decorative.
 *
 *  Three rules, each for a case that really occurs on npm:
 *    1. wrappers drop the punctuation — react-chartjs-2 is chart.js, but does
 *       not contain the string "chart.js". Compare with punctuation stripped.
 *    2. short names need whole-part matching — d3-scale IS d3, while a package
 *       merely named d3po-helpers is not.
 *    3. the list can never be complete, so anything whose name carries a
 *       chart-shaped word is caught even if nobody thought of it.
 */
function partsOf(name) {
  return name.replace(/^@/, "").split(/[/\-._]/).filter(Boolean);
}
const squash = (name) => name.toLowerCase().replace(/[^a-z0-9]/g, "");
const CHART_WORD = /^(charts?|graphs?|plots?)/;

function violates(name) {
  const lower = name.toLowerCase();
  const parts = partsOf(lower);
  for (const banned of BANNED) {
    // 1. multi-word bans, punctuation ignored on both sides
    if (partsOf(banned).length > 1 && squash(lower).includes(squash(banned))) return banned;
    // 2. single-word bans must match a whole part
    if (partsOf(banned).length === 1 && parts.includes(banned)) return banned;
  }
  // 3. the open-ended rule
  const charty = parts.find((part) => CHART_WORD.test(part));
  return charty ? `ชื่อมีคำว่า "${charty}"` : null;
}

const offenders = installed.filter((name) => violates(name) !== null);
check.eq(
  "ไม่มี library กราฟใน dependencies",
  offenders.map((name) => `${name} (${violates(name)})`),
  [],
);

for (const banned of BANNED) {
  check.ok(
    `ไม่มี ${banned}`,
    !installed.some((name) => violates(name) === banned),
    "D35: charts are drawn with inline SVG, never with a package",
  );
}

// The matcher itself is checked, because a ban that quietly stops matching is
// worse than no ban — these are the exact names that slipped an earlier draft.
check.eq(
  "ตัวจับชื่อยังจับตัวห่อและชื่อย่อยได้",
  ["react-chartjs-2", "@nivo/line", "d3-scale", "vue-echarts", "ng2-charts"].filter(
    (name) => violates(name) === null,
  ),
  [],
);
check.eq(
  "ตัวจับชื่อไม่เหวี่ยงแหใส่ชื่อที่พ้องกันเฉย ๆ",
  ["d3po-helpers-unrelated", "react-dom", "class-variance-authority", "lucide-react"].filter(
    (name) => violates(name) !== null,
  ),
  [],
);

// --- the spec must keep saying so ------------------------------------------
const spec = readFileSync(join(WEB, "..", "docs", "05-web-spec.md"), "utf8");
check.ok(
  "สเปกยังห้าม library กราฟ (5.0.12)",
  /ห้ามมีเด็ดขาด:[^\n]*Library กราฟ/.test(spec),
  "the ban disappeared from 5.0.12",
);
check.ok(
  "สเปกระบุว่า Phase 6 ใช้ inline SVG เท่านั้น",
  /Phase 6 มีกราฟที่วาดด้วย inline SVG เท่านั้น ห้ามใช้ library กราฟ \(D35\)/.test(spec),
);

// --- and no chart is smuggled in through a CDN or a dynamic import ---------
// Nothing in src should reach for one of these over the network either.
function everyFile(dir, found = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) everyFile(full, found);
    else if (/\.(tsx?|jsx?|css)$/.test(entry.name)) found.push(full);
  }
  return found;
}

const sourceFiles = everyFile(SRC);
const smuggled = sourceFiles.filter((file) => {
  const text = readFileSync(file, "utf8");
  return BANNED.some((banned) => text.toLowerCase().includes(banned + "/dist"))
    || /from ["']https?:\/\/[^"']*(chart|plotly|echarts|d3)/i.test(text);
});
check.eq(
  "ไม่มีการดึง library กราฟผ่าน CDN หรือ dynamic import ในซอร์ส",
  smuggled.map((f) => f.slice(SRC.length + 1)),
  [],
);
check.ok("สแกนไฟล์ซอร์สครบ", sourceFiles.length > 50, `scanned ${sourceFiles.length} files`);

process.exit(check.done() ? 1 : 0);
