/** D75 — ย่อรูปในมือถือก่อนส่ง: ขนาดเท่า backend · ตั้งตรง · ล้มเหลวแล้วส่งไฟล์เดิม
 *
 *  The real lib/scan/device-resize.ts is transpiled with the project's own
 *  TypeScript and run (D43-a) — nothing is copied into this file. The browser
 *  parts (decode, draw) are passed in, so each way of failing can be made to
 *  happen on purpose.
 *
 *  What this cannot do is decode a picture: Node has no canvas. The real
 *  browser run, and its output fed to the backend, is
 *  backend/tests/test_scan_images.py (device_resized_* fixtures).
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import ts from "typescript";

import { createChecker, source } from "./lib.mjs";

const check = createChecker("D75 — ย่อรูปในมือถือก่อนส่ง");
const here = dirname(fileURLToPath(import.meta.url));

const tsSource = source("lib/scan/device-resize.ts");
const js = ts.transpileModule(tsSource, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
const lib = await import(`data:text/javascript;base64,${Buffer.from(js).toString("base64")}`);
check.ok(
  "โหลดโค้ดจริงได้ครบทุกฟังก์ชัน",
  ["readJpegLayout", "fitWithin", "uprightSize", "prepareForUpload"].every((name) => typeof lib[name] === "function"),
);

const fixture = (name) => new Uint8Array(readFileSync(join(here, "fixtures", "scan", name)));

// --- 1. the size rule is Pillow's: the same table the backend is held to ---
const table = JSON.parse(
  readFileSync(join(here, "..", "..", "..", "backend", "tests", "fixtures", "fit_within_cases.json"), "utf8"),
).cases;
check.ok("อ่านตารางขนาดจาก Pillow ได้", table.length >= 100, `${table.length} rows`);
check.eq(
  "fitWithin ได้ขนาดเดียวกับ Pillow ทุกแถว",
  table
    .filter((row) => JSON.stringify(lib.fitWithin(row.width, row.height, row.max_edge)) !== JSON.stringify(row.expect))
    .map((row) => `${row.width}x${row.height}@${row.max_edge} → ${lib.fitWithin(row.width, row.height, row.max_edge)} (Pillow ${row.expect})`),
  [],
);
check.eq(
  // D74: the case where thumbnail-after-draft and the full-size rule differ.
  "6001×6237 ได้ 2886×3000 ตามกฎขนาดเต็ม ไม่ใช่ 2887",
  lib.fitWithin(6001, 6237, 3000),
  [2886, 3000],
);

// --- 2. what the first bytes say, on real JPEGs -----------------------------
const PROBE = Uint8Array.from(atob(tsSource.match(/const PROBE_JPEG =\s*"([^"]+)"/)[1]), (c) => c.charCodeAt(0));
check.eq("ภาพทดสอบของเบราว์เซอร์: 2×1 สั่งหมุน 6", lib.readJpegLayout(PROBE), { width: 2, height: 1, orientation: 6 });
check.eq("รูปตั้งตรง 4000×3000", lib.readJpegLayout(fixture("upright-4000x3000.jpg")), { width: 4000, height: 3000, orientation: 1 });
check.eq("รูปจากกล้องที่สั่งหมุน 6 (EXIF แบบ MM ของ iPhone)", lib.readJpegLayout(fixture("turned6-4000x3000.jpg")), { width: 4000, height: 3000, orientation: 6 });
check.eq("สั่งหมุน 3 (EXIF แบบ II ของ Android หลายรุ่น)", lib.readJpegLayout(fixture("turned3-le-4000x3000.jpg")), { width: 4000, height: 3000, orientation: 3 });
check.eq("ไม่ใช่ JPEG", lib.readJpegLayout(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0, 0, 0, 0])), null);
check.eq("uprightSize สลับกว้างสูงเฉพาะ 5–8", [1, 3, 5, 6, 8].map((o) => lib.uprightSize(4000, 3000, o)), [[4000, 3000], [4000, 3000], [3000, 4000], [3000, 4000], [3000, 4000]]);

// --- 3. prepareForUpload, with the browser parts made to behave ------------
const SETTINGS = { max_edge_px: 3000, jpeg_quality: 88 };
const file = (name) => new Blob([fixture(name)], { type: "image/jpeg" });

/** A JPEG header claiming `width` × `height`, padded to `size` bytes. */
function jpegOf(width, height, size = 1000) {
  const bytes = new Uint8Array(Math.max(size, 30));
  bytes.set([0xff, 0xd8, 0xff, 0xc0, 0x00, 0x11, 0x08, height >> 8, height & 255, width >> 8, width & 255, 3]);
  return new Blob([bytes], { type: "image/jpeg" });
}

function machinery({ turns = true, decoded, draw, decode } = {}) {
  const calls = { decode: 0, draw: [] };
  return {
    calls,
    turnsPhotos: async () => turns,
    decode:
      decode ??
      (async () => {
        calls.decode += 1;
        return {
          ...decoded,
          close: () => {},
          draw: async (w, h, q) => {
            calls.draw.push([w, h, q]);
            return draw ? draw(w, h) : jpegOf(w, h);
          },
        };
      }),
  };
}

const run = async (name, m, settings = SETTINGS, timeout) => {
  const out = await lib.prepareForUpload(file(name), settings, m, timeout);
  return { resized: out.resizedOnDevice, size: out.body.size, note: out.note };
};

{
  const m = machinery({ decoded: { width: 1200, height: 900 } });
  const out = await run("small-1200x900.jpg", m);
  check.eq("รูปที่เล็กกว่าเกณฑ์ ส่งตามเดิม ไม่แตะเลย", [out.resized, out.size, m.calls.decode], [false, fixture("small-1200x900.jpg").length, 0]);
}
{
  const m = machinery({ decoded: { width: 4000, height: 3000 } });
  const out = await run("upright-4000x3000.jpg", m);
  check.eq("รูปใหญ่ตั้งตรง ย่อเป็น 3000×2250 q0.88 แล้วส่งตัวที่ย่อ", [out.resized, m.calls.draw], [true, [[3000, 2250, 0.88]]]);
}
{
  // A phone held upright: stored 4000 × 3000, tag 6, page is 3000 wide.
  const m = machinery({ decoded: { width: 3000, height: 4000 } });
  const out = await run("turned6-4000x3000.jpg", m);
  check.eq("🔴 รูปที่สั่งหมุน 6 ย่อเป็นแนวตั้ง 2250×3000 (หมุนก่อนย่อ)", [out.resized, m.calls.draw], [true, [[2250, 3000, 0.88]]]);
}
{
  const m = machinery({ turns: false, decoded: { width: 3000, height: 4000 } });
  const out = await run("turned6-4000x3000.jpg", m);
  check.eq("🔴 เบราว์เซอร์ไม่หมุนตาม EXIF → ส่งไฟล์เดิม ไม่ถอดรูปเลย", [out.resized, m.calls.decode], [false, 0]);
}
{
  // The probe said yes, but this photo came out unturned.
  const m = machinery({ decoded: { width: 4000, height: 3000 } });
  const out = await run("turned6-4000x3000.jpg", m);
  check.eq("🔴 ถอดแล้วขนาดไม่สลับตามที่ EXIF สั่ง → ส่งไฟล์เดิม", [out.resized, m.calls.draw.length], [false, 0]);
}
{
  const m = machinery({ decode: async () => { throw new Error("out of memory"); } });
  const out = await run("upright-4000x3000.jpg", m);
  check.eq("🔴 ถอดรูปไม่สำเร็จ (หน่วยความจำไม่พอ) → ส่งไฟล์เดิม ไม่ขึ้น error", [out.resized, out.size], [false, fixture("upright-4000x3000.jpg").length]);
}
{
  const m = machinery({ decoded: { width: 4000, height: 3000 }, draw: () => null });
  check.eq("วาดลง canvas แล้วไม่ได้ไฟล์ → ส่งไฟล์เดิม", (await run("upright-4000x3000.jpg", m)).resized, false);
}
{
  const m = machinery({ decode: () => new Promise(() => {}) });
  const out = await run("upright-4000x3000.jpg", m, SETTINGS, 50);
  check.eq("🔴 ค้างนานเกิน → ส่งไฟล์เดิม ไม่รอตลอดไป", [out.resized, /นานกว่า/.test(out.note)], [false, true]);
}
{
  const m = machinery({ decoded: { width: 4000, height: 3000 }, draw: () => jpegOf(2999, 2250) });
  check.eq("ผลย่อผิดขนาดไปหนึ่งพิกเซล → ส่งไฟล์เดิม", (await run("upright-4000x3000.jpg", m)).resized, false);
}
{
  const m = machinery({ decoded: { width: 4000, height: 3000 }, draw: (w, h) => jpegOf(w, h, 300_000) });
  check.eq("ย่อแล้วใหญ่กว่าเดิม → ส่งไฟล์เดิม", (await run("upright-4000x3000.jpg", m)).resized, false);
}
{
  const m = machinery({ decoded: { width: 4000, height: 3000 } });
  await run("upright-4000x3000.jpg", m, { max_edge_px: 2000, jpeg_quality: 70 });
  check.eq("ค่าย่อมาจากที่ส่งเข้ามา ไม่ได้เขียนตายในโค้ด", m.calls.draw, [[2000, 1500, 0.7]]);
}

// --- 4. one source for the numbers -----------------------------------------
const page = source("app/(app)/scan/new/page.tsx");  // moved from /scan in 6.4
const code = (text) => text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
check.eq(
  "ไม่มีเลข 3000 หรือ 88 เขียนตายในโค้ดฝั่งเว็บ (อ่านจาก backend ที่เดียว)",
  [["device-resize.ts", tsSource], ["scan/new/page.tsx", page]]
    .filter(([, text]) => /\b(3000|88|0\.88)\b/.test(code(text)))
    .map(([name]) => name),
  [],
);
check.ok("หน้าจอส่งค่าที่ได้จากคำตอบของ backend เข้าไปย่อ", /prepareForUpload\(file, scan\.device_resize\)/.test(page));
check.ok(
  "หน้าจอบอก backend ตามจริงว่าไฟล์ที่ส่งถูกย่อหรือไม่",
  /resizedOnDevice: prepared\.resizedOnDevice/.test(page),
);

process.exit(check.done() ? 1 : 0);
