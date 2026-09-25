/** 6.2 — อ่านชนิดไฟล์จากไบต์แรก ไม่เชื่อป้ายที่เบราว์เซอร์แปะมา
 *
 *  The HEIC decision rests on this function. An iPhone may hand over a HEIC
 *  photo labelled image/jpeg, labelled image/heic, or unlabelled; only the
 *  first bytes say which it really is. If this function misreads, the phone
 *  test reports the wrong finding and conversion gets written — or skipped —
 *  for the wrong reason.
 *
 *  The real function is lifted out of the source and run on real file headers
 *  (D43-a), and the declaration is matched whole and asserted found (D43-c).
 */

import { createChecker, source } from "./lib.mjs";

const check = createChecker("6.2 — ตรวจชนิดไฟล์รูปจากไบต์แรก");

const sniff = source("lib/scan/sniff.ts");

function declaration(label, pattern) {
  const found = sniff.match(pattern)?.[0] ?? "";
  check.ok(`อ่าน${label}ออกมาได้จริง`, found !== "", "nothing to assert against");
  return found;
}

const brands = declaration("รายชื่อ brand ของ HEIC", /const HEIC_BRANDS = new Set\(\[[^\]]*\]\);/);
const asciiFn = declaration("ฟังก์ชัน ascii", /function ascii\([\s\S]*?\n\}/);
const sniffFn = declaration("ฟังก์ชัน sniffFormat", /export function sniffFormat\([\s\S]*?\n\}/);

const body = [brands, asciiFn, sniffFn]
  .join("\n")
  .replace("function ascii(bytes: Uint8Array, from: number, to: number): string {", "function ascii(bytes, from, to) {")
  .replace("export function sniffFormat(bytes: Uint8Array): SniffedFormat {", "function sniffFormat(bytes) {");
const sniffFormat = new Function(`${body}\nreturn sniffFormat;`)();

const bytes = (...parts) =>
  new Uint8Array(parts.flatMap((part) => (typeof part === "string" ? [...part].map((c) => c.charCodeAt(0)) : part)));
// An ISO-BMFF header: 4 bytes of box size, "ftyp", then the brand.
const ftyp = (brand) => bytes([0, 0, 0, 0x18], "ftyp", brand, [0, 0, 0, 0]);

check.eq("ยกโค้ดจริงออกมารันได้", sniffFormat(bytes([0xff, 0xd8, 0xff, 0xe0])), "jpeg");
check.eq("PNG", sniffFormat(bytes([0x89], "PNG", [0x0d, 0x0a, 0x1a, 0x0a])), "png");
check.eq("WebP", sniffFormat(bytes("RIFF", [0, 0, 0, 0], "WEBP")), "webp");
check.eq("PDF", sniffFormat(bytes("%PDF-1.7")), "pdf");
check.eq("HEIC จาก iPhone (brand heic)", sniffFormat(ftyp("heic")), "heic");
check.eq("HEIF แบบ mif1 ก็นับเป็น HEIC", sniffFormat(ftyp("mif1")), "heic");
check.eq("AVIF ไม่ถูกนับเป็น HEIC", sniffFormat(ftyp("avif")), "avif");
check.eq(
  // An MP4 video shares the ftyp box with HEIC. Treating "has ftyp" as HEIC
  // would call a video a photo.
  "วิดีโอ MP4 (ftyp เหมือนกันแต่ brand ต่าง) ไม่ถูกนับเป็นรูป",
  sniffFormat(ftyp("isom")),
  "unknown",
);
check.eq("ไฟล์สั้นเกินไม่ทำให้พัง", sniffFormat(bytes([0xff])), "unknown");
check.eq(
  // JPEG is three specific bytes, not "starts with 0xFF".
  "ขึ้นต้น 0xFF แต่ไม่ใช่ JPEG",
  sniffFormat(bytes([0xff, 0x00, 0x00, 0x00])),
  "unknown",
);
check.eq("ไฟล์ว่าง", sniffFormat(new Uint8Array(0)), "unknown");
check.eq(
  // The whole reason this exists: the label says JPEG, the bytes say HEIC.
  "ตัดสินจากไบต์ ไม่ใช่จากชื่อหรือป้าย",
  sniffFormat(ftyp("heic")) !== "jpeg",
  true,
);

check.ok(
  "หน้าจอแสดงทั้งป้ายของเบราว์เซอร์และชนิดจริงคู่กัน",
  (() => {
    const page = source("app/(app)/scan/page.tsx");
    return /page\.file\.type/.test(page) && /FORMAT_LABEL\[page\.sniffed\]/.test(page);
  })(),
  "the finding is the disagreement between the two, so both must be on screen",
);

process.exit(check.done() ? 1 : 0);
