/** What a file really is, read from its first bytes (งาน 6.2 · การตรวจ HEIC).
 *
 *  The browser's `file.type` is a label, and on phones it is not always the
 *  truth: an iPhone may hand over a HEIC photo labelled image/jpeg after
 *  converting it, or labelled image/heic, or with no label at all. Whether the
 *  backend has to convert HEIC depends on which of those really happens, so
 *  the first bytes are read and compared with the label.
 */

export type SniffedFormat = "jpeg" | "png" | "webp" | "heic" | "avif" | "pdf" | "unknown";

// ISO base media "brands" that mean HEIC/HEIF. A HEIC file starts with a box
// whose type is "ftyp" at byte 4, followed by the brand at byte 8.
const HEIC_BRANDS = new Set(["heic", "heix", "hevc", "hevx", "heim", "heis", "mif1", "msf1"]);

function ascii(bytes: Uint8Array, from: number, to: number): string {
  return String.fromCharCode(...bytes.slice(from, to));
}

export function sniffFormat(bytes: Uint8Array): SniffedFormat {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "jpeg";
  if (bytes.length >= 8 && ascii(bytes, 1, 4) === "PNG" && bytes[0] === 0x89) return "png";
  if (bytes.length >= 12 && ascii(bytes, 0, 4) === "RIFF" && ascii(bytes, 8, 12) === "WEBP") return "webp";
  if (bytes.length >= 5 && ascii(bytes, 0, 5) === "%PDF-") return "pdf";
  if (bytes.length >= 12 && ascii(bytes, 4, 8) === "ftyp") {
    const brand = ascii(bytes, 8, 12);
    if (brand === "avif" || brand === "avis") return "avif";
    if (HEIC_BRANDS.has(brand)) return "heic";
  }
  return "unknown";
}

/** Reads just enough of the file to tell what it is. */
export async function sniffFile(file: File): Promise<SniffedFormat> {
  const head = await file.slice(0, 32).arrayBuffer();
  return sniffFormat(new Uint8Array(head));
}

/** "2.4 MB" / "830 KB" — for a person, not for arithmetic. */
export function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}
