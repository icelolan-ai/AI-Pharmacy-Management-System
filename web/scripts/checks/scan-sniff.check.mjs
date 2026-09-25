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

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

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

// --- the capture screen after the HEIC test (D69) ---------------------------
// The finding is in: a real iPhone sends JPEG both ways. The temporary panel
// that showed the browser's label beside the real type has done its job.
const page = source("app/(app)/scan/page.tsx");

check.eq(
  "ถอดแผงทดสอบ HEIC ออกแล้ว — ไม่มีคำเทคนิคบนหน้าจอ",
  ["เบราว์เซอร์บอกว่า", "ไฟล์จริงเป็น", "page.file.type"].filter((text) => page.includes(text)),
  [],
);

// Every accept= on the page, matched whole and asserted found (D43-c).
const accepts = [...page.matchAll(/accept="([^"]*)"/g)].map((match) => match[1]);
check.eq("มีปุ่มเลือกไฟล์ 2 ปุ่ม (ถ่ายรูป · คลังรูป)", accepts.length, 2);
check.eq(
  "ไม่รับ PDF แล้ว — ย่อไม่ได้ และยังไม่ได้นิยาม for_ai ของ PDF (D69)",
  accepts.filter((value) => /pdf/i.test(value)),
  [],
);

// The screen checks the bytes before sending and skips what the backend
// would refuse. Which formats it sends is the real list from the page, and
// every one of them must be something the sniffer can actually return.
const sendable = page.match(/const SENDABLE: readonly SniffedFormat\[\] = \[([^\]]*)\];/)?.[1] ?? "";
const sendableList = [...sendable.matchAll(/"(\w+)"/g)].map((match) => match[1]);
check.eq("ส่งเฉพาะ JPEG · PNG · WebP — ตรงกับที่ backend รับ", sendableList, ["jpeg", "png", "webp"]);
check.eq(
  "HEIC ไม่อยู่ในรายการที่ส่ง",
  sendableList.includes(sniffFormat(ftyp("heic"))),
  false,
);

// A person sees one message whichever side refused. The web's words are
// looked up in the backend's own source (D43-e), so neither can drift alone.
const backend = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "backend", "app", "services", "invoice_scans.py"),
  "utf8",
);
const webRefusals = [...page.matchAll(/(?:heic|pdf): "([^"]+)"|const REFUSAL_OTHER = "([^"]+)"/g)].map(
  (match) => match[1] ?? match[2],
);
check.eq("อ่านข้อความปฏิเสธของเว็บได้ครบ 3 ข้อ", webRefusals.length, 3);
check.eq(
  "ข้อความปฏิเสธบนเว็บ ตรงกับของ backend ทุกคำ",
  webRefusals.filter((text) => !backend.includes(`"${text}"`)),
  [],
);
check.ok(
  "ข้อความ HEIC บอกทางออก ไม่ใช่แค่บอกว่าไม่รองรับ",
  webRefusals.some((text) => text.includes("ลองกดถ่ายรูปแทน")),
);

process.exit(check.done() ? 1 : 0);
