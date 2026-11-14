/** Shrink a photo on the phone before sending it (D75 · งาน 6.2).
 *
 *  A phone photo is 7–19 MB; the evidence copy the backend keeps is at most
 *  3000 px on the long edge. Shrinking here, with the backend's own numbers
 *  (sent in the scan answer — never written in this file), sends a fraction
 *  of the bytes. The backend then sees a JPEG that already meets its rule
 *  and keeps it as it came, so what is stored is the same size and the same
 *  way up as if the backend had shrunk it.
 *
 *  Three ways this could go wrong, each closed off:
 *
 *  1. The size differs by a pixel from the backend's. `fitWithin` is
 *     Pillow's rule, held to the same table of sizes the backend is held to
 *     (backend/tests/fixtures/fit_within_cases.json).
 *
 *  2. The picture lies on its side. A camera often stores pixels turned and
 *     an EXIF tag saying how to turn them back; drawing on a canvas drops
 *     the tag, so if the browser did not turn the pixels first, the backend
 *     would receive a sideways photo with nothing left to say so — the
 *     quietest way this could fail. So before trusting the browser with a
 *     turned photo: a tiny probe photo checks that it turns them at all, and
 *     the decoded size must come out swapped when the tag says a quarter
 *     turn. Anything unproven is sent as it came, for the backend to turn.
 *
 *  3. Shrinking fails — memory on an iPhone, a picture too large, a browser
 *     without the parts. Every failure, and anything taking longer than
 *     `timeoutMs`, sends the original instead. Never an error: the backend
 *     shrinks it anyway, only slower.
 *
 *  Whatever happens, `resizedOnDevice` says which file is going up. The
 *  backend records it as the client's word, unchecked (D69).
 */

export type DeviceResizeSettings = { max_edge_px: number; jpeg_quality: number };

export type JpegLayout = { width: number; height: number; orientation: number };

export type PreparedUpload = {
  body: Blob;
  resizedOnDevice: boolean;
  /** Why this file, for the measurement line on screen. */
  note: string;
};

export type Decoded = {
  width: number;
  height: number;
  draw: (width: number, height: number, quality: number) => Promise<Blob | null>;
  close: () => void;
};

/** The browser parts, passed in so a check can make them fail on purpose. */
export type Machinery = {
  decode: (file: Blob) => Promise<Decoded>;
  turnsPhotos: () => Promise<boolean>;
};

/** Enough of the file to reach the frame header past EXIF and colour data. */
const HEAD_BYTES = 256 * 1024;

const SOF_MARKERS = new Set([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf]);

function exifOrientation(bytes: Uint8Array, start: number, end: number): number {
  // "Exif\0\0", then a TIFF header: byte order, 42, offset of the first IFD.
  const tiff = start + 6;
  if (end - tiff < 8) return 1;
  const little = bytes[tiff] === 0x49 && bytes[tiff + 1] === 0x49;
  const big = bytes[tiff] === 0x4d && bytes[tiff + 1] === 0x4d;
  if (!little && !big) return 1;
  const u16 = (at: number) => (little ? bytes[at] | (bytes[at + 1] << 8) : (bytes[at] << 8) | bytes[at + 1]);
  const u32 = (at: number) => (little ? u16(at) + u16(at + 2) * 65536 : u16(at) * 65536 + u16(at + 2));
  const ifd = tiff + u32(tiff + 4);
  if (ifd + 2 > end) return 1;
  const count = u16(ifd);
  for (let k = 0; k < count; k++) {
    const entry = ifd + 2 + k * 12;
    if (entry + 12 > end) return 1;
    if (u16(entry) === 0x0112) {
      const value = u16(entry + 8);
      return value >= 1 && value <= 8 ? value : 1;
    }
  }
  return 1;
}

/** Width, height (as stored, before any turn) and EXIF orientation of a
 *  JPEG, from its first bytes. null when it is not a JPEG this can read. */
export function readJpegLayout(bytes: Uint8Array): JpegLayout | null {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;
  let orientation = 1;
  let i = 2;
  while (i + 4 <= bytes.length) {
    if (bytes[i] !== 0xff) return null;
    const marker = bytes[i + 1];
    if (marker === 0xff) {
      i += 1; // fill byte
      continue;
    }
    if (marker === 0xda || marker === 0xd9) return null; // picture data before any frame header
    const length = (bytes[i + 2] << 8) | bytes[i + 3];
    const end = i + 2 + length;
    if (length < 2) return null;
    if (SOF_MARKERS.has(marker)) {
      if (i + 9 > bytes.length) return null;
      const height = (bytes[i + 5] << 8) | bytes[i + 6];
      const width = (bytes[i + 7] << 8) | bytes[i + 8];
      return width > 0 && height > 0 ? { width, height, orientation } : null;
    }
    if (
      marker === 0xe1 &&
      end <= bytes.length &&
      bytes[i + 4] === 0x45 && bytes[i + 5] === 0x78 && bytes[i + 6] === 0x69 && bytes[i + 7] === 0x66 &&
      bytes[i + 8] === 0 && bytes[i + 9] === 0
    ) {
      orientation = exifOrientation(bytes, i + 4, end);
    }
    i = end;
  }
  return null;
}

/** Pillow's thumbnail size rule (backend app/scan/images.py fit_within). */
export function fitWithin(width: number, height: number, maxEdge: number): [number, number] {
  if (width <= maxEdge && height <= maxEdge) return [width, height];
  const roundAspect = (value: number, key: (n: number) => number) => {
    const low = Math.floor(value);
    const high = Math.ceil(value);
    // Python's min() keeps the first of equals: the lower one.
    return Math.max(key(low) <= key(high) ? low : high, 1);
  };
  let x = maxEdge;
  let y = maxEdge;
  const aspect = width / height;
  if (x / y >= aspect) {
    x = roundAspect(y * aspect, (n) => Math.abs(aspect - n / y));
  } else {
    y = roundAspect(x / aspect, (n) => (n === 0 ? 0 : Math.abs(aspect - x / n)));
  }
  return [x, y];
}

/** Orientations 5–8 turn the picture a quarter: width and height swap. */
export function uprightSize(width: number, height: number, orientation: number): [number, number] {
  return orientation >= 5 && orientation <= 8 ? [height, width] : [width, height];
}

class GiveUp extends Error {}

function withTimeout<T>(work: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new GiveUp(`ใช้เวลานานกว่า ${ms / 1000} วินาที`)), ms);
    work.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

async function head(blob: Blob, length = HEAD_BYTES): Promise<Uint8Array> {
  return new Uint8Array(await blob.slice(0, length).arrayBuffer());
}

/** The file to send: the phone's shrunk copy when every step is proven,
 *  otherwise the original. Never throws. */
export async function prepareForUpload(
  file: Blob,
  settings: DeviceResizeSettings,
  machinery: Machinery = browserMachinery,
  timeoutMs = 20_000,
): Promise<PreparedUpload> {
  const asIs = (note: string): PreparedUpload => ({ body: file, resizedOnDevice: false, note });
  try {
    const layout = readJpegLayout(await head(file));
    if (!layout) return asIs("ส่งตามเดิม (ไม่ใช่ JPEG ที่อ่านได้)");
    if (Math.max(layout.width, layout.height) <= settings.max_edge_px) return asIs("ส่งตามเดิม (เล็กพออยู่แล้ว)");

    const [uprightWidth, uprightHeight] = uprightSize(layout.width, layout.height, layout.orientation);
    const [width, height] = fitWithin(uprightWidth, uprightHeight, settings.max_edge_px);

    const shrunk = await withTimeout(
      (async () => {
        if (layout.orientation !== 1 && !(await machinery.turnsPhotos())) {
          throw new GiveUp("เบราว์เซอร์ไม่หมุนรูปตาม EXIF");
        }
        const decoded = await machinery.decode(file);
        try {
          if (decoded.width !== uprightWidth || decoded.height !== uprightHeight) {
            throw new GiveUp("ขนาดหลังถอดรูปไม่ตรงกับทิศที่ควรเป็น");
          }
          return await decoded.draw(width, height, settings.jpeg_quality / 100);
        } finally {
          decoded.close();
        }
      })(),
      timeoutMs,
    );

    if (!shrunk || shrunk.type !== "image/jpeg") return asIs("ส่งตามเดิม (ย่อไม่สำเร็จ)");
    // What comes out must be exactly what was asked for, and upright.
    const made = readJpegLayout(await head(shrunk));
    if (!made || made.width !== width || made.height !== height || made.orientation !== 1) {
      return asIs("ส่งตามเดิม (ผลย่อไม่ตรงขนาด)");
    }
    if (shrunk.size >= file.size) return asIs("ส่งตามเดิม (ย่อแล้วไม่เล็กลง)");
    return { body: shrunk, resizedOnDevice: true, note: "ย่อในมือถือแล้ว" };
  } catch (error) {
    return asIs(`ส่งตามเดิม (${error instanceof GiveUp ? error.message : "ย่อไม่สำเร็จ"})`);
  }
}

// --- the real browser parts -------------------------------------------------

/** 2×1 white JPEG whose EXIF says "turn a quarter" (orientation 6). A
 *  browser that turns photos decodes it as 1×2. */
const PROBE_JPEG =
  "/9j/4AAQSkZJRgABAQAAAQABAAD/4QAiRXhpZgAATU0AKgAAAAgAAQESAAMAAAABAAYAAAAAAAD/2wBDABALDA4MChAODQ4SERATGCgaGBYWGDEjJR0oOjM9PDkzODdASFxOQERXRTc4UG1RV19iZ2hnPk1xeXBkeFxlZ2P/2wBDARESEhgVGC8aGi9jQjhCY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2P/wAARCAABAAIDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwD0CiiigD//2Q==";

async function decodeInBrowser(file: Blob): Promise<Decoded> {
  // The default is to turn the pixels the way EXIF says ("from-image");
  // the probe and the size check above confirm it rather than trust it.
  const bitmap = await createImageBitmap(file);
  return {
    width: bitmap.width,
    height: bitmap.height,
    close: () => bitmap.close(),
    draw: (width, height, quality) => {
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext("2d");
      if (!context) return Promise.resolve(null);
      context.imageSmoothingEnabled = true;
      context.imageSmoothingQuality = "high";
      context.drawImage(bitmap, 0, 0, width, height);
      return new Promise<Blob | null>((resolve) =>
        canvas.toBlob(
          (blob) => {
            // Give the memory back at once — iPhones are short of it.
            canvas.width = 0;
            canvas.height = 0;
            resolve(blob);
          },
          "image/jpeg",
          quality,
        ),
      );
    },
  };
}

let probe: Promise<boolean> | null = null;

function turnsPhotosInBrowser(): Promise<boolean> {
  probe ??= (async () => {
    try {
      const bytes = Uint8Array.from(atob(PROBE_JPEG), (c) => c.charCodeAt(0));
      const bitmap = await createImageBitmap(new Blob([bytes], { type: "image/jpeg" }));
      const turned = bitmap.width === 1 && bitmap.height === 2;
      bitmap.close();
      return turned;
    } catch {
      return false;
    }
  })();
  return probe;
}

export const browserMachinery: Machinery = { decode: decodeInBrowser, turnsPhotos: turnsPhotosInBrowser };
