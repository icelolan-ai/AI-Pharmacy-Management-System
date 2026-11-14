"""Turn one uploaded photo into the two files that are stored (D68 · 6.2).

    upload (as the phone sent it, up to MAX_UPLOAD_BYTES)
      -> original   the copy kept as evidence, long edge <= ORIGINAL_MAX_EDGE_PX
      -> for_ai     the copy the AI reads,      long edge <= AI_IMAGE_MAX_EDGE_PX

Nothing here touches the network or the database. It takes bytes and gives
bytes plus the facts migration 012 records about them.

What the file is comes from its first bytes, never from the label the
browser attached (D69): an iPhone labels its own conversions, and the label
can be wrong in either direction.

A file is stored exactly as it arrived only when all of these hold — anything
else is turned upright and written as a fresh JPEG:
  - it is a JPEG
  - its long edge is within the limit for that copy
  - it fits in the bucket (STORED_MAX_BYTES)
  - no EXIF orientation asks for it to be turned
The last one matters as much as the size: a delivery note lying on its side
is as hard for the AI to read as for a person, and a wrong reading caused by
it would send us to fix the prompt instead of the picture.

For_ai is made from the decoded upload, not from the stored original, so it
is compressed once rather than twice.

Metadata, on every stored file whichever path made it:
  original  GPS removed (EXIF and XMP); camera, model and date kept — they
            help when checking a photo later
  for_ai    every describing segment removed. It is the one file that leaves
            our hands, and nothing in it helps a machine read a delivery note
Both are done without re-encoding (app/scan/jpeg.py), so a file kept as it
came is still "not re-encoded": its picture fingerprint equals the upload's.
"""

import hashlib
import io
from dataclasses import dataclass

from PIL import Image, ImageOps, UnidentifiedImageError

from app.scan.jpeg import JpegStructureError, picture_sha256, strip_gps, strip_metadata

JPEG = "image/jpeg"

# EXIF tag 0x0112. 1 means "already upright"; 2-8 ask the viewer to flip or
# turn the pixels.
_ORIENTATION_TAG = 0x0112

# ISO base media brands that mean HEIC/HEIF — the same list as the web's
# lib/scan/sniff.ts, so both sides call the same bytes the same thing.
_HEIC_BRANDS = {b"heic", b"heix", b"hevc", b"hevx", b"heim", b"heis", b"mif1", b"msf1"}

# What the first bytes may say, and the content type it is recorded as.
_CONTENT_TYPES = {
    "jpeg": JPEG,
    "png": "image/png",
    "webp": "image/webp",
    "heic": "image/heic",
    "avif": "image/avif",
    "pdf": "application/pdf",
}
ACCEPTED = frozenset({"jpeg", "png", "webp"})


def sniff(data: bytes) -> str:
    """jpeg | png | webp | heic | avif | pdf | unknown — from the bytes alone."""
    if data[:3] == b"\xff\xd8\xff":
        return "jpeg"
    if data[:8] == b"\x89PNG\r\n\x1a\n":
        return "png"
    if data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        return "webp"
    if data[:5] == b"%PDF-":
        return "pdf"
    if data[4:8] == b"ftyp":
        brand = data[8:12]
        if brand in (b"avif", b"avis"):
            return "avif"
        if brand in _HEIC_BRANDS:
            return "heic"
    return "unknown"


class ImageRejected(Exception):
    """The upload cannot become a stored image. `reason` says why, for the
    caller to turn into words a person can act on."""

    def __init__(self, reason: str, sniffed: str) -> None:
        super().__init__(reason)
        self.reason = reason  # "unsupported" | "unreadable" | "too_many_pixels" | "too_large_after_shrink"
        self.sniffed = sniffed


@dataclass(frozen=True)
class Source:
    """What really arrived. Dimensions are as stored in the file, before any
    turn asked for by EXIF."""

    content_type: str
    bytes: int
    width_px: int
    height_px: int
    sha256: str
    # Fingerprint of the parts that decode the picture (jpeg.picture_sha256).
    # None when the upload is not a JPEG.
    picture_sha256: str | None


@dataclass(frozen=True)
class Stored:
    data: bytes
    content_type: str
    width_px: int
    height_px: int
    reencoded: bool
    picture_sha256: str

    @property
    def bytes(self) -> int:
        return len(self.data)


@dataclass(frozen=True)
class Prepared:
    source: Source
    original: Stored
    for_ai: Stored


@dataclass(frozen=True)
class Limits:
    original_max_edge_px: int
    original_jpeg_quality: int
    ai_image_max_edge_px: int
    ai_image_jpeg_quality: int
    stored_max_bytes: int

    @classmethod
    def from_settings(cls, settings) -> "Limits":
        return cls(
            original_max_edge_px=settings.original_max_edge_px,
            original_jpeg_quality=settings.original_jpeg_quality,
            ai_image_max_edge_px=settings.ai_image_max_edge_px,
            ai_image_jpeg_quality=settings.ai_image_jpeg_quality,
            stored_max_bytes=settings.stored_max_bytes,
        )


def _orientation(image: Image.Image) -> int:
    try:
        return int(image.getexif().get(_ORIENTATION_TAG, 1) or 1)
    except Exception:
        return 1


def _finish(data: bytes, width: int, height: int, reencoded: bool, strip) -> Stored:
    trimmed = strip(data)
    return Stored(trimmed, JPEG, width, height, reencoded, picture_sha256(trimmed))


def _as_is(data: bytes, source: Source, sniffed: str, orientation: int,
           max_edge: int, max_bytes: int, strip) -> Stored | None:
    if (
        sniffed == "jpeg"
        and source.picture_sha256 is not None
        and max(source.width_px, source.height_px) <= max_edge
        and len(data) <= max_bytes
        and orientation == 1
    ):
        try:
            return _finish(data, source.width_px, source.height_px, False, strip)
        except JpegStructureError:
            return None  # cannot trim it in place — write it fresh instead
    return None


def _flatten(image: Image.Image) -> Image.Image:
    """RGB with any transparency laid on white, as paper would be."""
    if image.mode in ("RGBA", "LA") or (image.mode == "P" and "transparency" in image.info):
        rgba = image.convert("RGBA")
        white = Image.new("RGB", rgba.size, (255, 255, 255))
        white.paste(rgba, mask=rgba.getchannel("A"))
        return white
    return image.convert("RGB")


def _encode(upright: Image.Image, max_edge: int, quality: int, max_bytes: int, sniffed: str,
            strip) -> Stored:
    image = upright.copy()
    image.thumbnail((max_edge, max_edge), Image.LANCZOS)
    buffer = io.BytesIO()
    # No exif= argument: the pixels are already upright, so the orientation
    # tag must not travel with them (it would turn them a second time).
    image.save(buffer, "JPEG", quality=quality, optimize=True)
    data = buffer.getvalue()
    if len(data) > max_bytes:
        # Measured not to happen (7.5 MB worst case against 10 MB). If it
        # ever does, refuse rather than hand the bucket something it rejects.
        raise ImageRejected("too_large_after_shrink", sniffed)
    # Pillow can carry a comment across from the upload; the strip runs here
    # too, so what is stored never depends on which path made it.
    return _finish(data, image.width, image.height, True, strip)


def _source_picture(data: bytes, sniffed: str) -> str | None:
    if sniffed != "jpeg":
        return None
    try:
        return picture_sha256(data)
    except JpegStructureError:
        return None


def prepare(data: bytes, limits: Limits) -> Prepared:
    sniffed = sniff(data)
    if sniffed not in ACCEPTED:
        raise ImageRejected("unsupported", sniffed)

    try:
        image = Image.open(io.BytesIO(data))
        width, height = image.size
    except Image.DecompressionBombError:
        raise ImageRejected("too_many_pixels", sniffed) from None
    except (UnidentifiedImageError, OSError, ValueError):
        raise ImageRejected("unreadable", sniffed) from None

    source = Source(
        content_type=_CONTENT_TYPES[sniffed],
        bytes=len(data),
        width_px=width,
        height_px=height,
        sha256=hashlib.sha256(data).hexdigest(),
        picture_sha256=_source_picture(data, sniffed),
    )
    orientation = _orientation(image)

    original = _as_is(data, source, sniffed, orientation,
                      limits.original_max_edge_px, limits.stored_max_bytes, strip_gps)
    for_ai = _as_is(data, source, sniffed, orientation,
                    limits.ai_image_max_edge_px, limits.stored_max_bytes, strip_metadata)

    if original is None or for_ai is None:
        try:
            if sniffed == "jpeg":
                # Decode at a reduced scale when the target is much smaller:
                # a 48 MP photo then never sits in memory at full size.
                edge = limits.original_max_edge_px
                image.draft("RGB", (edge, edge))
            image.load()
            upright = _flatten(ImageOps.exif_transpose(image))
        except Image.DecompressionBombError:
            raise ImageRejected("too_many_pixels", sniffed) from None
        except (OSError, ValueError, SyntaxError):
            raise ImageRejected("unreadable", sniffed) from None

        if original is None:
            original = _encode(upright, limits.original_max_edge_px,
                               limits.original_jpeg_quality, limits.stored_max_bytes, sniffed,
                               strip_gps)
        if for_ai is None:
            for_ai = _encode(upright, limits.ai_image_max_edge_px,
                             limits.ai_image_jpeg_quality, limits.stored_max_bytes, sniffed,
                             strip_metadata)
    else:
        # Stored as it came — still make sure it is a whole picture, so a
        # truncated file is refused here and not discovered by the AI.
        try:
            image.load()
        except (OSError, ValueError, SyntaxError):
            raise ImageRejected("unreadable", sniffed) from None

    return Prepared(source=source, original=original, for_ai=for_ai)
