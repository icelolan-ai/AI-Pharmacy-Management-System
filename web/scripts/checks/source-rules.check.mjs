/** กติกาที่ใช้กับซอร์สทั้งโปรเจกต์ — ไม่ผูกกับหน้าใดหน้าหนึ่ง
 *
 *  Two rules live here, and they are here together for the same reason:
 *  each can be broken anywhere in the tree, neither shows up in the build,
 *  and the only way to find a breach is to walk every file.
 *
 *  **D35 — ห้ามมี library กราฟ.** Two written rules already forbid it, and
 *  one fails the whole gate on contact: 05-web-spec.md 5.0.12 lists
 *  "Library กราฟ" among the packages banned outright, and item 45 of the
 *  closing checklist says any dependency outside 5.0.12 is an immediate
 *  fail. Reaching for a charting package is the normal way to draw a chart
 *  and nothing else in the build would complain, so it is checked here
 *  rather than left to whoever reads the checklist last.
 *
 *  **D48 — ห้ามมีขนาดตัวอักษรนอก scale.** A fixed size like `text-[11px]`
 *  reads nothing from the type scale, so moving the scale never moves it.
 *  Two of them sat in the menu through the whole of D47-4 at 11px and 10px
 *  on a phone.
 *
 *  The file was called no-chart-library.check.mjs until 25 ก.ย. 2569. A name
 *  narrower than the contents invites the next reader to decide the other
 *  rule does not belong here and tidy it away.
 */

import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { createChecker, SRC } from "./lib.mjs";

const check = createChecker("กติกาของซอร์สทั้งโปรเจกต์ — D35 ห้าม library กราฟ · D48 ห้ามขนาดนอก scale");

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

// --- D48: ไม่มีขนาดตัวอักษรที่อยู่นอก scale -------------------------------
//
// This lives in the file that already walks every source file, because the
// rule is the same shape as the one above: easy to break anywhere, invisible
// to the build, and only findable by sweeping.
//
// D47-4 moved the whole app's type scale from one place, which works because
// Tailwind compiles `text-sm` to `var(--text-sm)`. A fixed size like
// `text-[11px]` reads nothing from that variable, so it sails through
// untouched. Two of them were sitting in the menu — 11px on the group's
// status line and 10px on the "กำลังดูอยู่" badge — and survived the entire
// D47-4 pass on a phone. A hand sweep catches what is there today; it cannot
// catch what someone writes tomorrow.
//
// Comments are stripped first. An earlier check in this project matched its
// own explanatory comment and reported a violation that did not exist, so the
// stripper keeps the newlines and blanks only the comment bodies, leaving
// every line number where it was.
function stripComments(text) {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, (block) => block.replace(/[^\n]/g, " "))
    // Not preceded by ':' so that "https://…" is never read as a comment.
    .replace(/(^|[^:])\/\/[^\n]*/gm, (whole, before) => before + " ".repeat(whole.length - before.length));
}

// `\b` before the prefix group keeps "context-[…]" out of it, while the group
// itself lets any number of variant prefixes through and keeps them in the
// message: a report that says `text-[13px]` when the source says
// `sm:text-[13px]` sends the reader looking for the wrong string.
const OFF_SCALE = /\b(?:[a-z][a-z0-9-]*:)*text-\[[^\]]*\]/g;

// The matcher itself is checked first. A matcher that quietly stops matching
// is worse than no rule at all, and the prefix case is exactly what a simpler
// pattern misses.
const probe = (line) => (stripComments(line).match(OFF_SCALE) ?? []).length;
check.eq(
  "ตัวจับค่าตายตัวจับได้ทั้งแบบมีและไม่มี prefix",
  [
    probe('className="text-[13px]"'),
    probe('className="sm:text-[13px]"'),
    probe('className="md:hover:text-[0.9rem] text-[11px]"'),
  ],
  [1, 1, 2],
);
check.eq(
  "ตัวจับไม่เหวี่ยงแหใส่คอมเมนต์ หรือชื่อคลาสที่พ้องกัน",
  [
    probe("// เคยใช้ text-[11px] แต่ย้ายขึ้น scale แล้ว"),
    probe("/* text-[10px] */"),
    probe('className="context-[x] subtext-[y]"'),
    probe('const url = "https://x.test/text-[9px]";'),
  ],
  [0, 0, 0, 1],
);

const offScale = [];
for (const file of sourceFiles) {
  const lines = stripComments(readFileSync(file, "utf8")).split("\n");
  lines.forEach((line, index) => {
    const found = line.match(OFF_SCALE);
    if (found) offScale.push(`${file.slice(SRC.length + 1)}:${index + 1} ${found.join(" ")}`);
  });
}
check.eq(
  "ไม่มีขนาดตัวอักษรที่อยู่นอก scale ในซอร์สเลย (D48)",
  offScale,
  [],
  // Every entry prints file:line and the class, so the fix needs no hunting.
);

// --- 6.1: คีย์ AI และการเรียก AI ต้องอยู่ฝั่ง backend เท่านั้น -----------------
//
// 🔴 ห้ามลบตลอดไป (Chat A, งาน 6.1)
//
// This is the one line in the whole project that, crossed once, cannot be
// uncrossed. Anything under web/src ends up in a bundle a browser downloads,
// and a key that reaches a browser has to be treated as published: it gets
// revoked and replaced, and every bill run up on it in the meantime is ours.
// So the browser never holds an AI key and never talks to an AI provider; it
// asks our backend, which does.
//
// Four ways it could leak, each checked on its own:
//   1. the key's name in source — process.env.GEMINI_API_KEY and friends
//   2. a NEXT_PUBLIC_ variable carrying an AI key, in source or in the web
//      env files: Next inlines every NEXT_PUBLIC_ value into the bundle, so
//      naming one in .env.local is enough to ship it
//   3. a provider's endpoint called straight from the browser
//   4. a provider's SDK installed in the web app
//
// Comments are stripped first (D43-e: what this reports must be findable), so
// a comment explaining the rule never trips it.
const AI_KEY_NAMES = /\b(?:NEXT_PUBLIC_[A-Z0-9_]*(?:GEMINI|OPENAI|ANTHROPIC|CLAUDE|AI_KEY|AI_API)[A-Z0-9_]*|GEMINI_API_KEY|OPENAI_API_KEY|ANTHROPIC_API_KEY|AI_PROVIDER)\b/g;
const AI_ENDPOINTS = /generativelanguage\.googleapis\.com|api\.openai\.com|api\.anthropic\.com/g;
const AI_SDKS = ["@google/generative-ai", "@google/genai", "openai", "@anthropic-ai/sdk", "@ai-sdk/google", "ai"];

function aiLeaks(text) {
  return [
    ...(text.match(AI_KEY_NAMES) ?? []),
    ...(text.match(AI_ENDPOINTS) ?? []),
    ...AI_SDKS.filter((sdk) => new RegExp(`from ["']${sdk.replace(/[/.@-]/g, "\\$&")}["']`).test(text)),
  ];
}

// The matcher first, with the spellings that matter and the ones that must
// not trip it.
check.eq(
  "ตัวจับคีย์ AI จับได้ทุกทางที่คีย์จะหลุดไปถึงเบราว์เซอร์",
  [
    aiLeaks("const k = process.env.GEMINI_API_KEY;").length,
    aiLeaks("const k = process.env.NEXT_PUBLIC_GEMINI_KEY;").length,
    aiLeaks('fetch("https://generativelanguage.googleapis.com/v1beta/models")').length,
    aiLeaks('import { GoogleGenerativeAI } from "@google/generative-ai";').length,
    aiLeaks('import OpenAI from "openai";').length,
  ],
  [1, 1, 1, 1, 1],
);
check.eq(
  "ตัวจับคีย์ AI ไม่จับคอมเมนต์ หรือคำที่แค่คล้ายกัน",
  [
    aiLeaks(stripComments("// ห้ามใช้ GEMINI_API_KEY ในเว็บ")).length,
    aiLeaks(stripComments("/* generativelanguage.googleapis.com */")).length,
    aiLeaks('const label = "AI ช่วยอ่านใบส่งของ";').length,
    aiLeaks('import { cn } from "@/lib/utils";').length,
  ],
  [0, 0, 0, 0],
);

const aiInSource = [];
for (const file of sourceFiles) {
  const lines = stripComments(readFileSync(file, "utf8")).split("\n");
  lines.forEach((line, index) => {
    const found = aiLeaks(line);
    if (found.length) aiInSource.push(`${file.slice(SRC.length + 1)}:${index + 1} ${found.join(" ")}`);
  });
}
check.eq(
  "🔴 ไม่มีไฟล์ใดใน web/src อ้างถึงคีย์ AI หรือเรียก AI โดยตรง",
  aiInSource,
  [],
);

// The env files: names only are read here. No value is ever printed.
const envNames = [];
for (const name of [".env.local", ".env.local.example", ".env", ".env.production"]) {
  let text;
  try {
    text = readFileSync(join(WEB, name), "utf8");
  } catch {
    continue;
  }
  text.split("\n").forEach((line, index) => {
    const key = /^\s*([A-Z0-9_]+)\s*=/.exec(line)?.[1];
    if (key && aiLeaks(key).length) envNames.push(`web/${name}:${index + 1} ${key}`);
  });
}
check.eq(
  "🔴 ไฟล์ env ของเว็บไม่มีตัวแปรคีย์ AI (NEXT_PUBLIC_ จะถูกฝังลงบันเดิล)",
  envNames,
  [],
);

const webDeps = [
  ...Object.keys(manifest.dependencies ?? {}),
  ...Object.keys(manifest.devDependencies ?? {}),
];
check.eq(
  "🔴 เว็บไม่ได้ติดตั้ง SDK ของผู้ให้บริการ AI",
  webDeps.filter((dep) => AI_SDKS.includes(dep)),
  [],
);

// --- 6.2: service_role key อยู่ฝั่ง backend เท่านั้น -------------------------
//
// 🔴 ห้ามลบตลอดไป (Chat A, งาน 6.2 · A-1)
//
// An AI key that leaks costs money. This one costs the shop: it bypasses every
// row-level rule in the database, so whoever holds it can read and delete
// every sale, every lot, every receipt. The backend needs it to write to
// Storage and to sign URLs; the browser must never see it.
//
// Four ways it could reach a browser, each checked on its own:
//   1. its name in source — SUPABASE_SERVICE_ROLE_KEY, anything *SERVICE_ROLE*
//   2. a NEXT_PUBLIC_ variable in the web env files carrying it
//   3. the key itself pasted into source — the sb_secret_ prefix, or an old
//      style JWT whose payload says role "service_role"
//   4. the key's VALUE sitting under an innocent-looking name in a web env
//      file, e.g. NEXT_PUBLIC_SUPABASE_KEY=sb_secret_… — the name looks
//      harmless, so only the value gives it away. Values are read to decide,
//      and never printed: a failure names the file, the line and the variable.
const SERVICE_NAMES = /\b[A-Z0-9_]*(?:SERVICE_ROLE|SUPABASE_SECRET)[A-Z0-9_]*\b/g;
const SECRET_PREFIX = /\bsb_secret_[A-Za-z0-9_-]{8,}/g;
const JWT = /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g;

function isServiceJwt(token) {
  try {
    const payload = token.split(".")[1];
    const json = Buffer.from(payload.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
    return JSON.parse(json).role === "service_role";
  } catch {
    return false;
  }
}

function serviceLeaks(text) {
  return [
    ...(text.match(SERVICE_NAMES) ?? []),
    ...(text.match(SECRET_PREFIX) ?? []).map(() => "sb_secret_…"),
    ...(text.match(JWT) ?? []).filter(isServiceJwt).map(() => "JWT role=service_role"),
  ];
}

// A fake service-role JWT, built here so no real key ever sits in this file.
const fakeServiceJwt = [
  "eyJhbGciOiJIUzI1NiJ9",
  Buffer.from(JSON.stringify({ role: "service_role", ref: "example0000000000" })).toString("base64url"),
  "c2lnbmF0dXJlLW5vdC1yZWFs",
].join(".");
const fakeAnonJwt = [
  "eyJhbGciOiJIUzI1NiJ9",
  Buffer.from(JSON.stringify({ role: "anon", ref: "example0000000000" })).toString("base64url"),
  "c2lnbmF0dXJlLW5vdC1yZWFs",
].join(".");

check.eq(
  "ตัวจับ service_role จับได้ทุกทางที่คีย์จะหลุดไปถึงเบราว์เซอร์",
  [
    serviceLeaks("const k = process.env.SUPABASE_SERVICE_ROLE_KEY;").length,
    serviceLeaks("const k = process.env.NEXT_PUBLIC_SERVICE_ROLE;").length,
    serviceLeaks('const k = "sb_secret_abcdefghijklmnop";').length,
    serviceLeaks(`const k = "${fakeServiceJwt}";`).length,
  ],
  [1, 1, 1, 1],
);
check.eq(
  "ตัวจับ service_role ไม่จับคีย์ publishable/anon หรือคอมเมนต์",
  [
    serviceLeaks('const k = "sb_publishable_abcdefghijklmnop";').length,
    serviceLeaks(`const k = "${fakeAnonJwt}";`).length,
    serviceLeaks(stripComments("// ห้ามใช้ SUPABASE_SERVICE_ROLE_KEY ในเว็บ")).length,
  ],
  [0, 0, 0],
);

/** The variable's name when a web env line carries the key — by its name or
 *  by its value — else null. Only the name ever leaves this function. */
function envLineLeak(line) {
  const match = /^\s*([A-Z0-9_]+)\s*=\s*(.*)$/.exec(line);
  if (!match) return null;
  const [, key, value] = match;
  const bare = value.trim().replace(/^["']|["']$/g, "");
  return serviceLeaks(key).length || serviceLeaks(bare).length ? key : null;
}

check.eq(
  "ตัวจับในไฟล์ env ดูทั้งชื่อตัวแปรและค่า",
  [
    envLineLeak("NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY=placeholder"),
    envLineLeak("NEXT_PUBLIC_SUPABASE_KEY=sb_secret_abcdefghijklmnop"),
    envLineLeak('NEXT_PUBLIC_SUPABASE_KEY="sb_secret_abcdefghijklmnop"'),
    envLineLeak(`NEXT_PUBLIC_SUPABASE_KEY=${fakeServiceJwt}`),
    envLineLeak("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_abcdefghijklmnop"),
    envLineLeak("# SUPABASE_SERVICE_ROLE_KEY อยู่ที่ backend เท่านั้น"),
  ],
  [
    "NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY",
    "NEXT_PUBLIC_SUPABASE_KEY",
    "NEXT_PUBLIC_SUPABASE_KEY",
    "NEXT_PUBLIC_SUPABASE_KEY",
    null,
    null,
  ],
);

const serviceInSource = [];
for (const file of sourceFiles) {
  const lines = stripComments(readFileSync(file, "utf8")).split("\n");
  lines.forEach((line, index) => {
    const found = serviceLeaks(line);
    if (found.length) serviceInSource.push(`${file.slice(SRC.length + 1)}:${index + 1} ${found.join(" ")}`);
  });
}
check.eq("🔴 ไม่มีไฟล์ใดใน web/src อ้างถึงหรือฝัง service_role key", serviceInSource, []);

const serviceInEnv = [];
for (const name of [".env.local", ".env.local.example", ".env", ".env.production"]) {
  let text;
  try {
    text = readFileSync(join(WEB, name), "utf8");
  } catch {
    continue;
  }
  text.split("\n").forEach((line, index) => {
    const key = envLineLeak(line);
    if (key) serviceInEnv.push(`web/${name}:${index + 1} ${key}`);
  });
}
check.eq(
  "🔴 ไฟล์ env ของเว็บไม่มี service_role key ทั้งในชื่อตัวแปรและในค่า",
  serviceInEnv,
  [],
);

process.exit(check.done() ? 1 : 0);
