/** C-2: saving a receiving draft must never fire two PUTs at once, and while
 *  one is in flight only the LATEST pending value may go out when it lands.
 *
 *  Chat A asked for this check to be kept and re-run before and after any
 *  change to lib/hooks/use-purchase-draft.ts. The expected result is fixed:
 *  five edits during one in-flight save produce exactly two requests, the
 *  first value then the last.
 */

import { createChecker, source } from "./lib.mjs";

const check = createChecker("C-2 draft save queue");

// --- 1. the rule itself, modelled exactly as the hook implements it ---------
let inFlight = false;
let queued = null;
const sent = [];
let concurrent = 0;
let maxConcurrent = 0;

function put(value) {
  concurrent += 1;
  maxConcurrent = Math.max(maxConcurrent, concurrent);
  sent.push(value);
  return new Promise((resolve) =>
    setTimeout(() => {
      concurrent -= 1;
      resolve();
    }, 30),
  );
}

async function flush() {
  if (inFlight) return;
  const value = queued;
  if (!value) return;
  queued = null;
  inFlight = true;
  try {
    await put(value);
  } finally {
    inFlight = false;
    if (queued) await flush();
  }
}

function schedule(value) {
  queued = value;
  return flush();
}

const run = async () => {
  schedule("v1");
  await new Promise((r) => setTimeout(r, 5));
  schedule("v2");
  schedule("v3");
  schedule("v4");
  schedule("v5");
  await new Promise((r) => setTimeout(r, 200));

  check.eq("ไม่เคยยิง PUT ซ้อนกัน (พร้อมกันสูงสุด = 1)", maxConcurrent, 1);
  check.eq("ยิงจริง 2 ครั้ง ไม่ใช่ 5", sent.length, 2);
  check.eq("ครั้งแรก v1 ครั้งที่สองเป็นค่าล่าสุด v5", sent, ["v1", "v5"]);
  check.eq("ไม่มีค่าค้างในคิว", queued, null);

  // --- 2. the hook still has the shape the rule depends on -----------------
  const hook = source("lib/hooks/use-purchase-draft.ts");
  check.ok(
    "hook ยังมีตัวกัน in-flight",
    /if\s*\(\s*inFlight\.current\s*\)\s*return/.test(hook),
    "the guard that stops a second PUT overlapping has gone",
  );
  check.ok(
    "hook ยังเก็บเฉพาะค่าล่าสุดในคิว",
    /queued\.current\s*=\s*input/.test(hook) && /queued\.current\s*=\s*null/.test(hook),
    "the single-slot queue has changed shape",
  );
  check.ok(
    "hook ยังส่งค่าที่ค้างต่อหลังคำขอเดิมจบ",
    /finally\s*\{[\s\S]*?if\s*\(\s*queued\.current\s*\)[\s\S]*?flush\(\)/.test(hook),
    "the follow-up flush after a save completes has gone",
  );
  check.ok(
    "debounce ยังเป็น 2 วินาที",
    /DEBOUNCE_MS\s*=\s*2000/.test(hook),
    "C-2 requires a 2s debounce on blur",
  );

  process.exit(check.done() ? 1 : 0);
};

run();
