/** Where a page starts when it is shown (D78 round 3, from the iPhone).
 *
 *  The bug: changing page kept the old scroll position whenever the new
 *  page's top was still "in the viewport" by Next.js's measure, which does
 *  not count our sticky top bar. Measured at 375px before the fix: คลังยา
 *  scrolled to 40 → รับสินค้า opened at 40, its first line under the bar;
 *  at 134 → opened at 134. After: 0 both times; ← back to คลังยา → 134.
 *
 *  The rule is real code (lib/nav/scroll.ts) and is run here as it is. That
 *  the app uses it, last and before painting, is checked from the source.
 */

import { createChecker, source } from "./lib.mjs";
import { loadTs } from "./load-ts.mjs";

const check = createChecker("D78 รอบ 3 — เปลี่ยนหน้าแล้วเริ่มที่บนสุด แบบแอป iOS");
const { ScrollMemory, tapScrollsToTop } = await loadTs("lib/nav/scroll");

// --- 1. the rule ------------------------------------------------------------
{
  const memory = new ScrollMemory();
  memory.remember("/stock", 40);
  check.eq("🔴 ไปหน้าใหม่: เริ่มที่ 0 แม้หน้าก่อนเลื่อนค้างไว้ 40", memory.arrive("/receiving"), 0);
  memory.remember("/receiving", 134);
  check.eq("🔴 ไปหน้าใหม่: เริ่มที่ 0 แม้หน้าก่อนเลื่อนค้างไว้ 134", memory.arrive("/sell"), 0);
  memory.remember("/stock", 520);
  check.eq("ไปหน้าที่เคยเปิด (ไม่ใช่การย้อน) ก็เริ่มที่ 0", memory.arrive("/stock"), 0);
}
{
  const memory = new ScrollMemory();
  memory.remember("/stock", 520);
  memory.arrive("/stock/abc");
  memory.returnTo("/stock");
  check.eq("← กลับหน้าแม่: กลับไปตำแหน่งที่เลื่อนค้างไว้", memory.arrive("/stock"), 520);
  check.eq("การย้อนใช้ได้ครั้งเดียว: เปิดหน้าเดิมอีกครั้งแบบปกติ เริ่มที่ 0", memory.arrive("/stock"), 0);
  memory.returnTo("/history/sales");
  check.eq("ย้อนไปหน้าที่ไม่เคยเลื่อน: เริ่มที่ 0", memory.arrive("/history/sales"), 0);
  memory.returnTo("/stock");
  check.eq("ขอย้อนไปหน้าหนึ่ง แต่ได้หน้าอื่น: หน้านั้นเริ่มที่ 0", memory.arrive("/sell"), 0);
  memory.remember("/stock", -12);
  memory.returnTo("/stock");
  check.eq("ค่าติดลบจากการเด้งของ iOS ไม่ถูกจำ", memory.arrive("/stock"), 0);
}
check.eq("กดแท็บของหน้าที่อยู่: เลื่อนขึ้นบนสุด", tapScrollsToTop("/stock", "/stock"), true);
check.eq("กดแท็บคลังยาจากหน้ารายละเอียดยา: ไปหน้าคลังยา ไม่ใช่แค่เลื่อน", tapScrollsToTop("/stock/abc", "/stock"), false);

// --- 2. the app uses it -----------------------------------------------------
const layout = source("app/(app)/layout.tsx").replace(/\s+/g, " ");
check.ok(
  "🔴 layout วาง PageScroll หลัง <main> (ได้พูดคำสุดท้ายหลัง Next.js)",
  /<\/main>.{0,120}<PageScroll pathname=\{pathname\} \/>/.test(layout),
);
const pageScroll = source("components/nav/PageScroll.tsx");
check.ok(
  "ตั้งตำแหน่งใน useLayoutEffect ก่อนวาดจอ ตามที่ ScrollMemory ตัดสิน",
  /useLayoutEffect\(\(\) => \{[\s\S]*?const target = scrollMemory\.arrive\(pathname\);\s*window\.scrollTo\(\{ top: target, behavior: "instant" \}\);/.test(pageScroll),
);
check.ok("จำตำแหน่งระหว่างเลื่อนของหน้าที่แสดงอยู่", /scrollMemory\.remember\(shown\.current, window\.scrollY\)/.test(pageScroll));
check.ok("ปุ่มย้อนของเบราว์เซอร์ / ปัดย้อนของ iPhone นับเป็นการย้อน", /"popstate"[\s\S]{0,200}scrollMemory\.returnTo\(window\.location\.pathname\)|scrollMemory\.returnTo\(window\.location\.pathname\)[\s\S]{0,300}"popstate"/.test(pageScroll));
check.ok("หน้าที่ข้อมูลมาทีหลัง: ลองตั้งตำแหน่งซ้ำเมื่อหน้ายาวขึ้น และหยุดเมื่อผู้ใช้แตะจอ", /new ResizeObserver/.test(pageScroll) && /"touchstart"/.test(pageScroll));

const mobile = source("components/nav/MobileNav.tsx");
check.ok("← บอกว่าเป็นการย้อนไปหน้าแม่", /transitionTypes=\{\["nav-back"\]\}\s*onClick=\{\(\) => scrollMemory\.returnTo\(parent\.href\)\}/.test(mobile));
check.ok(
  "แท็บของหน้าที่อยู่: ไม่โหลดซ้ำ เลื่อนขึ้นบนสุด (และนิ่งเมื่อปิดการเคลื่อนไหว)",
  /if \(tapScrollsToTop\(pathname, tab\.href\)\) \{\s*event\.preventDefault\(\);[\s\S]{0,200}prefers-reduced-motion: reduce[\s\S]{0,120}window\.scrollTo\(\{ top: 0, behavior: still \? "instant" : "smooth" \}\)/.test(mobile),
);

process.exit(check.done() ? 1 : 0);
