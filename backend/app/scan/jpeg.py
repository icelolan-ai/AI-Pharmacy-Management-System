"""Read and trim the metadata of a JPEG without touching its picture (6.2).

A JPEG is a row of segments. Some decode the picture — the quantization and
Huffman tables (DQT, DHT), the frame header (SOF), the scan and its
compressed data (SOS onwards). Others only describe it: EXIF and XMP live in
APP1, IPTC in APP13, free text in COM. Removing a describing segment leaves
every pixel exactly as it was, because nothing that decodes the picture
changes. Measured on a real file before this was written (D67): GPS removed
from EXIF and XMP, the compressed picture identical byte for byte, decoded
pixels identical.

`picture_sha256` fingerprints only the segments that decode the picture, so
it stays the same when metadata is removed and changes when the picture
does. Migration 013 compares it between what arrived and what was stored:
that is what keeps "not re-encoded" impossible to claim falsely once
headers can be trimmed.
"""

import hashlib
import struct

from PIL import Image

# Segments that only describe the picture and are never needed to decode it.
# APP0 (JFIF), APP2 (ICC colour profile) and APP14 (Adobe colour transform)
# are left alone: they carry nothing personal, and APP14 changes how some
# JPEGs decode.
_METADATA_MARKERS = frozenset({0xE1, *range(0xE3, 0xEE), 0xEF, 0xFE})

_SOI = b"\xff\xd8"
_SOS = 0xDA
_GPS_IFD = 0x8825
_EXIF_PREFIX = b"Exif\x00\x00"
_XMP_PREFIXES = (b"http://ns.adobe.com/xap/1.0/\x00", b"http://ns.adobe.com/xmp/extension/\x00")


class JpegStructureError(ValueError):
    """The file does not have the segment layout this module can trim."""


def _segments(data: bytes) -> list[tuple[int, bytes]]:
    """(marker, whole segment) up to the scan; the scan and everything after
    it is the last item, marked SOS."""
    if data[:2] != _SOI:
        raise JpegStructureError("no start of image")
    found: list[tuple[int, bytes]] = []
    i = 2
    while i < len(data):
        if data[i] != 0xFF:
            raise JpegStructureError(f"expected a marker at byte {i}")
        while i + 1 < len(data) and data[i + 1] == 0xFF:  # fill bytes
            i += 1
        if i + 1 >= len(data):
            break
        marker = data[i + 1]
        if marker == _SOS:
            found.append((marker, data[i:]))
            return found
        if i + 4 > len(data):
            raise JpegStructureError("segment header cut off")
        length = struct.unpack(">H", data[i + 2:i + 4])[0]
        end = i + 2 + length
        if length < 2 or end > len(data):
            raise JpegStructureError(f"segment at byte {i} runs past the end")
        found.append((marker, data[i:end]))
        i = end
    raise JpegStructureError("no image data")


def _join(segments: list[tuple[int, bytes]]) -> bytes:
    return _SOI + b"".join(segment for _, segment in segments)


def picture_sha256(data: bytes) -> str:
    """Fingerprint of everything that decodes the picture, and nothing else."""
    kept = [(m, s) for m, s in _segments(data) if m not in _METADATA_MARKERS]
    return hashlib.sha256(_join(kept)).hexdigest()


def _is_xmp(segment: bytes) -> bool:
    return segment[1] == 0xE1 and segment[4:].startswith(_XMP_PREFIXES)


def strip_metadata(data: bytes) -> bytes:
    """Every describing segment removed: EXIF, XMP, IPTC, comments.
    For the copy that leaves our hands (for_ai)."""
    return _join([(m, s) for m, s in _segments(data) if m not in _METADATA_MARKERS])


def strip_gps(data: bytes) -> bytes:
    """Only the position removed: the GPS block of EXIF, and any XMP block
    that names a position. Camera make, model and date stay — they help when
    checking a photo later. For the evidence copy (original)."""
    out: list[tuple[int, bytes]] = []
    for marker, segment in _segments(data):
        body = segment[4:]
        if marker == 0xE1 and body.startswith(_EXIF_PREFIX):
            exif = Image.Exif()
            exif.load(body)
            if _GPS_IFD in exif:
                del exif[_GPS_IFD]
                rebuilt = exif.tobytes()
                if len(rebuilt) + 2 > 0xFFFF:
                    raise JpegStructureError("EXIF too large to rewrite")
                segment = b"\xff\xe1" + struct.pack(">H", len(rebuilt) + 2) + rebuilt
        elif _is_xmp(segment) and b"GPS" in body:
            continue
        out.append((marker, segment))
    return _join(out)
