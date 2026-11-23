/** Every word a screen reader speaks is Thai (Chat A, after 6.4: the shared
 *  dialog's close button was named "Close").
 *
 *  Swept on 24 Nov 2569: source (every .ts/.tsx under src) and the rendered
 *  pages / · /sell · /stock · /receiving at 375px — one English name found,
 *  in components/ui/dialog.tsx, now "ปิด".
 *
 *  What counts: hidden text (className="sr-only"), and aria-label · title ·
 *  alt written as plain strings, when they hold an English word and no Thai
 *  at all. A Thai sentence that names a term (FEFO, LOT) is fine. Values
 *  built from variables ({…}) are not plain strings and are left to review.
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

import { createChecker, SRC } from "./lib.mjs";

const check = createChecker("ชื่อสำหรับโปรแกรมอ่านหน้าจอเป็นภาษาไทย");

function files(dir) {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) return files(full);
    return /\.(tsx|ts)$/.test(name) && !/\.test\./.test(name) ? [full] : [];
  });
}

const englishOnly = (text) => /[A-Za-z]{3,}/.test(text) && !/[฀-๿]/.test(text);
const found = [];
let scanned = 0;
for (const full of files(SRC)) {
  const text = readFileSync(full, "utf8");
  const where = relative(SRC, full).replace(/\\/g, "/");
  for (const m of text.matchAll(/className="[^"]*\bsr-only\b[^"]*"[^>]*>([^<{]+)</g)) {
    scanned += 1;
    if (englishOnly(m[1])) found.push(`${where}: sr-only "${m[1].trim()}"`);
  }
  for (const m of text.matchAll(/\b(aria-label|title|alt)=(?:"([^"]*)"|\{"([^"]*)"\}|\{'([^']*)'\})/g)) {
    scanned += 1;
    const value = m[2] ?? m[3] ?? m[4] ?? "";
    if (englishOnly(value)) found.push(`${where}: ${m[1]}="${value}"`);
  }
}
check.ok("พบชื่อให้ตรวจจริง (ตัวสแกนไม่ได้ว่างเปล่า)", scanned >= 20, `scanned ${scanned}`);
check.eq("🔴 ไม่มีชื่อภาษาอังกฤษล้วนที่โปรแกรมอ่านหน้าจอจะอ่าน", found, []);
check.ok("ปุ่มปิดของกล่องโต้ตอบกลางชื่อ ปิด", /className="sr-only">ปิด</.test(readFileSync(join(SRC, "components/ui/dialog.tsx"), "utf8")));

process.exit(check.done() ? 1 : 0);
