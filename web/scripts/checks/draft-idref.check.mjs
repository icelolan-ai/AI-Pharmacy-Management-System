/** Which purchase the next draft save writes to.
 *
 *  usePurchaseDraft keeps that id in a ref because the debounce timer, Ctrl+S
 *  and the step-2 button all fire long after the render that last saw the
 *  prop. The assignment used to happen during render; it now happens in an
 *  effect. Getting this wrong is expensive in a way the user sees: a ref stuck
 *  on null makes every autosave POST a NEW draft, so one receiving note turns
 *  into a pile of half-filled drafts.
 *
 *  draft-queue.check.mjs must keep its output byte-identical, so it cannot
 *  grow assertions. This file is the separate one Chat A asked for.
 */

import { createChecker, source } from "./lib.mjs";

const check = createChecker("usePurchaseDraft — the id ref follows the prop");

// --- 1. moving the assignment must change nothing observable ---------------
/** The hook's id handling, with the sync point as a parameter so the old
 *  design and the new one can be run against the same script.
 *  `parentKeepsId` is the caller: /receiving/[id] puts the created id into
 *  state, which is what makes the second save an update rather than a create. */
function runScript({ syncPoint, parentKeepsId, script = "newDraft" }) {
  let prop = script === "newDraft" ? null : "p1";
  let idRef = null;
  let mounted = false;
  const calls = [];
  let nextId = 1;

  /** One render plus its commit, in React's order. */
  function render() {
    if (!mounted) {
      idRef = prop; // useRef(purchaseId) — the initial value
      mounted = true;
      return;
    }
    if (syncPoint === "render") idRef = prop; // the old code, during render
    if (syncPoint === "effect") idRef = prop; // the new code, after commit
  }

  /** What flush() does with the id, once the debounce has elapsed. */
  function save(value) {
    if (idRef) {
      calls.push(`update ${idRef} ${value}`);
      return;
    }
    const created = `p${nextId++}`;
    calls.push(`create ${value} -> ${created}`);
    idRef = created;
    // onCreated: the page stores it and re-renders.
    if (parentKeepsId) prop = created;
    render();
  }

  render();
  if (script === "newDraft") {
    save("a");
    save("b");
    render(); // an unrelated re-render, e.g. the supplier box losing focus
    save("c");
  } else {
    // The page hands the hook a different draft without unmounting it. This is
    // the only path where the sync does any work, and the only one where
    // getting it wrong writes one receiving note's lines into another.
    save("a");
    prop = "p2";
    render();
    save("b");
  }
  return calls;
}

for (const parentKeepsId of [true, false]) {
  const label = parentKeepsId ? "หน้าจอเก็บ id ที่เพิ่งสร้าง" : "หน้าจอไม่เก็บ id (กรณีเสีย)";
  check.eq(
    `${label}: ย้าย assign จาก render ไป effect แล้วผลเหมือนเดิมทุกประการ`,
    runScript({ syncPoint: "effect", parentKeepsId }),
    runScript({ syncPoint: "render", parentKeepsId }),
  );
}

check.eq(
  "บันทึกร่างครั้งแรกสร้างใบเดียว ครั้งต่อ ๆ ไปแก้ใบเดิม",
  runScript({ syncPoint: "effect", parentKeepsId: true }),
  ["create a -> p1", "update p1 b", "update p1 c"],
);

// The sync only earns its keep when the page swaps in a different draft while
// the hook stays mounted. Both the old and the new design follow the swap.
check.eq(
  "เปลี่ยนไปร่างอีกใบ: บันทึกลงใบใหม่ถูกต้อง",
  runScript({ syncPoint: "effect", parentKeepsId: true, script: "switchDraft" }),
  ["update p1 a", "update p2 b"],
);
// And this is the damage a frozen ref does — it must NOT look like the line
// above. An assertion that cannot tell these two apart is not an assertion.
const frozen = runScript({ syncPoint: "never", parentKeepsId: true, script: "switchDraft" });
check.eq(
  "ref ค้างที่ค่าตอน mount = เขียนทับร่างใบเก่า (ความเสียหายที่ต้องกันไว้)",
  frozen,
  ["update p1 a", "update p1 b"],
);

// --- 2. the hook still assigns where it says it does ----------------------
const hook = source("lib/hooks/use-purchase-draft.ts");
const assignments = hook.match(/idRef\.current\s*=/g) ?? [];

check.ok(
  "ref ตั้งค่าเริ่มต้นจาก prop ตอน mount ไม่ใช่ null",
  /useRef<string \| null>\(purchaseId\)/.test(hook),
  "starting at null makes the first save after a reload create a second draft",
);
check.ok(
  "sync idRef ใน effect และ effect นั้นรันทุก render (หรืออย่างน้อยเมื่อ purchaseId เปลี่ยน)",
  /useEffect\(\(\) => \{\s*idRef\.current = purchaseId;\s*\}(?:, \[purchaseId\])?\);/.test(hook),
  "an empty dependency list here freezes the ref at the first value it ever saw",
);
check.eq(
  "เขียน idRef แค่ 2 จุดเท่านั้น: effect ที่ sync กับตอนสร้างใบใหม่",
  assignments.length,
  2,
);
check.ok(
  "จุดที่สองคือตอนสร้างร่างใหม่ ภายใน flush",
  /const created = await createPurchase\(input\);\s*idRef\.current = created\.id;/.test(hook),
  "flush must claim the new id itself; waiting for the prop would create twice",
);

process.exit(check.done() ? 1 : 0);
