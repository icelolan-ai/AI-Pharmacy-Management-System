/** Loading the signed-in user's profile must not loop, and must not overlap.
 *
 *  Chat A asked for a permanent check on two properties of AuthProvider:
 *    1. reloadProfile cannot re-trigger itself — writing the result must not
 *       be an input to the effect that produced it, or /me is called forever.
 *    2. a session change must not leave two /me calls racing. The loser of
 *       that race would decide which user's name and role the app shows, and
 *       the role decides what the menu offers, so the wrong winner is a
 *       permissions bug, not a cosmetic one.
 *
 *  Both are modelled the way the provider implements them: one effect keyed on
 *  [session, attempt], an AbortController per run, and every visible field
 *  derived from the last finished call rather than written by it.
 */

import { createChecker, source } from "./lib.mjs";

const check = createChecker("AuthProvider — /me loads once, never twice at once");

// --- 1. the provider, modelled as React would run it -----------------------
function createProvider() {
  const stats = { effectRuns: 0, started: 0, writable: 0, maxWritable: 0, aborted: 0 };

  let session = null;
  let attempt = 0;
  let profile = { session: null, attempt: -1, me: null, error: null };

  let prevDeps = null;
  let cleanup = null;
  let pending = [];

  /** Exactly the expressions in the component. */
  function view() {
    const sameUser =
      session !== null && profile.session !== null && profile.session.user.id === session.user.id;
    return {
      me: sameUser ? profile.me : null,
      profileError: sameUser ? profile.error : null,
      profileLoading:
        session !== null && !(profile.session === session && profile.attempt === attempt),
    };
  }

  function runEffect() {
    if (!session) {
      cleanup = null;
      return;
    }
    stats.effectRuns += 1;
    stats.started += 1;
    stats.writable += 1;
    stats.maxWritable = Math.max(stats.maxWritable, stats.writable);

    const controller = { aborted: false };
    const forSession = session;
    const forAttempt = attempt;

    pending.push({
      controller,
      settle(me, error) {
        if (controller.aborted) return; // already counted as aborted
        controller.done = true;
        stats.writable -= 1;
        profile = { session: forSession, attempt: forAttempt, me, error };
        render(); // setProfile re-renders
      },
    });

    cleanup = () => {
      if (controller.aborted || controller.done) return; // nothing left to cancel
      controller.aborted = true;
      stats.aborted += 1;
      stats.writable -= 1;
    };
  }

  /** A render: React re-runs the effect only when [session, attempt] changed. */
  function render() {
    const deps = [session, attempt];
    if (prevDeps && Object.is(prevDeps[0], deps[0]) && Object.is(prevDeps[1], deps[1])) return;
    if (cleanup) cleanup();
    prevDeps = deps;
    runEffect();
  }

  return {
    stats,
    view,
    setSession(next) {
      session = next;
      render();
    },
    reloadProfile() {
      attempt += 1;
      render();
    },
    /** Answer the oldest outstanding call — aborted ones included, because the
     *  network does not know the component moved on. */
    resolveOldest(me, error = null) {
      const next = pending.shift();
      next.settle(me, error);
    },
    resolveNewest(me, error = null) {
      const next = pending.pop();
      next.settle(me, error);
    },
  };
}

const owner = { user: { id: "u-owner" }, token: "t1" };
const ownerRefreshed = { user: { id: "u-owner" }, token: "t2" };
const staff = { user: { id: "u-staff" }, token: "t3" };

const OWNER_ME = { id: "u-owner", full_name: "เจ้าของร้าน", role: "owner" };
const STAFF_ME = { id: "u-staff", full_name: "พนักงานขาย", role: "staff" };

// --- signing in loads the profile once, and stops -------------------------
const app = createProvider();
app.setSession(owner);
check.eq("เข้าระบบแล้วยิง /me ครั้งเดียว", app.stats.started, 1);
check.eq("ระหว่างรอ ยังไม่มีสิทธิ์ให้ใช้", app.view().me, null);

app.resolveOldest(OWNER_ME);
check.eq("ได้โปรไฟล์แล้วแสดงสิทธิ์ถูกคน", app.view().me?.role, "owner");
check.eq("เขียนผลแล้ว effect ไม่รันซ้ำ (ไม่วนซ้ำ)", app.stats.effectRuns, 1);
check.eq("เขียนผลแล้วไม่ยิง /me ใหม่", app.stats.started, 1);
check.eq("โหลดเสร็จแล้วไม่ค้างสถานะกำลังโหลด", app.view().profileLoading, false);

// --- a token refresh keeps the user on screen -----------------------------
// Its /me is deliberately left outstanding: the switch below happens while a
// call for the previous user is still on the wire, which is the race.
app.setSession(ownerRefreshed);
check.eq("ต่ออายุ token: ชื่อและสิทธิ์ยังอยู่บนจอระหว่างโหลดใหม่", app.view().me?.role, "owner");

// --- switching user must not race ------------------------------------------
const before = app.stats.started;
app.setSession(staff);
check.eq("เปลี่ยนผู้ใช้: ยกเลิกคำขอเก่าก่อนยิงใหม่", app.stats.aborted, 1);
check.eq("เปลี่ยนผู้ใช้: ยิงใหม่ 1 ครั้ง", app.stats.started - before, 1);
check.eq(
  "เปลี่ยนผู้ใช้: สิทธิ์ของคนเดิมหายทันที ไม่ค้างให้เห็นเมนูผิด",
  app.view().me,
  null,
);

// the previous user's call comes back late — it must change nothing
app.resolveOldest(OWNER_ME);
check.eq("ผลของผู้ใช้เดิมที่มาช้า เขียนทับไม่ได้", app.view().me, null);

app.resolveOldest(STAFF_ME);
check.eq("ได้โปรไฟล์ของผู้ใช้ใหม่ถูกต้อง", app.view().me?.role, "staff");
check.eq("ตลอดทั้งหมด ไม่เคยมีคำขอที่เขียนผลได้พร้อมกันเกิน 1", app.stats.maxWritable, 1);

// --- the retry button -------------------------------------------------------
const retry = createProvider();
retry.setSession(owner);
retry.resolveOldest(null, "ต่อเซิร์ฟเวอร์ไม่ได้");
check.eq("โหลดล้มเหลวแล้วมีข้อความบอก", retry.view().profileError, "ต่อเซิร์ฟเวอร์ไม่ได้");

retry.reloadProfile();
check.eq("กดลองใหม่: ข้อความเดิมยังอยู่ ไม่กระพริบกลับไปเป็นกำลังโหลด", retry.view().profileError, "ต่อเซิร์ฟเวอร์ไม่ได้");
check.eq("กดลองใหม่: ปุ่มถูก disable ระหว่างโหลด", retry.view().profileLoading, true);

retry.reloadProfile();
retry.reloadProfile();
check.eq("กดลองใหม่รัว ๆ ก็ไม่ยิงซ้อน", retry.stats.maxWritable, 1);
retry.resolveNewest(OWNER_ME);
check.eq("ลองใหม่สำเร็จแล้วข้อความหาย", retry.view().profileError, null);
check.eq("ลองใหม่สำเร็จแล้วได้สิทธิ์", retry.view().me?.role, "owner");

// --- signing out clears everything without asking the server ---------------
const startedBeforeSignOut = retry.stats.started;
retry.setSession(null);
check.eq("ออกจากระบบ: สิทธิ์หายทันที", retry.view().me, null);
check.eq("ออกจากระบบ: ไม่ยิง /me อีก", retry.stats.started, startedBeforeSignOut);

// --- 2. the component still has the shape those properties rest on ---------
const provider = source("components/auth-provider.tsx");

/** The text of one declaration only. Slicing matters: a lazy `[\s\S]*?` let
 *  loose on the whole file happily runs past the end of the block it was
 *  aiming at and matches the next one, which is how this very check first
 *  reported a passing `reloadProfile` while the old code still had `[session]`
 *  in its dependency list. */
function block(startsWith) {
  const from = provider.indexOf(startsWith);
  if (from === -1) return "";
  const next = provider.indexOf("\n  const ", from + startsWith.length);
  return provider.slice(from, next === -1 ? provider.length : next);
}

const effect = provider.slice(
  provider.indexOf("if (!session) return;"),
  provider.indexOf("const reloadProfile"),
);

check.ok(
  "effect ผูกกับ [session, attempt] เท่านั้น ไม่ผูกกับ reloadProfile",
  /\}, \[session, attempt\]\);/.test(effect) && !/reloadProfile/.test(effect),
  "an effect that depends on the function it calls can re-trigger itself",
);
check.ok(
  "reloadProfile identity คงที่ (useCallback deps ว่าง) จึงวนซ้ำไม่ได้",
  /\}, \[\]\);\s*$/.test(block("const reloadProfile = useCallback").trimEnd()),
  "any dependency here gives reloadProfile a new identity per session",
);
check.ok(
  "เปลี่ยน session หรือกดลองใหม่ ยกเลิกคำขอเดิม",
  /new AbortController\(\)/.test(effect) && /return \(\) => controller\.abort\(\);/.test(effect),
  "without the abort on cleanup two /me calls race",
);
check.ok(
  "คำขอที่ถูกยกเลิกแล้ว เขียนผลไม่ได้",
  (effect.match(/if \(controller\.signal\.aborted/g) ?? []).length === 2,
  "both the success and the failure path must check before writing",
);
check.ok(
  "ชื่อ สิทธิ์ และข้อความ error เป็นค่า derive ไม่มี setState หลงเหลือ",
  // \b, not `(`: a setter that merely EXISTS is enough to do harm, because
  // whatever state it owns can be read as a fallback and show a stale user.
  !/\bsetMe\b|\bsetProfileLoading\b|\bsetProfileError\b/.test(provider),
  "a leftover setter can write a stale user's role back onto the screen",
);

process.exit(check.done() ? 1 : 0);
