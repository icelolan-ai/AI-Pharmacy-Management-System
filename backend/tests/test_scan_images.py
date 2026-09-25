"""Shrinking an upload into the evidence copy and the AI copy (D68 · 6.2).

Every file here is a real image written by Pillow and read back through the
real code — no stand-ins for the decoder, the EXIF reader or the encoder.
The large one is a genuine 48-megapixel JPEG of pure noise: noise is what
JPEG compresses worst, so it is the heaviest file a phone could plausibly
send and the heaviest the shrink could produce.
"""

import hashlib
import io
import os

import pytest
from PIL import Image

from app.scan.images import ImageRejected, Limits, prepare, sniff

LIMITS = Limits(
    original_max_edge_px=3000,
    original_jpeg_quality=88,
    ai_image_max_edge_px=1600,
    ai_image_jpeg_quality=80,
    stored_max_bytes=10 * 1024 * 1024,
)

RED, BLUE, WHITE = (220, 30, 30), (30, 30, 220), (255, 255, 255)


def _jpeg(image: Image.Image, quality=90, exif=None) -> bytes:
    buffer = io.BytesIO()
    kwargs = {"quality": quality}
    if exif is not None:
        kwargs["exif"] = exif
    image.save(buffer, "JPEG", **kwargs)
    return buffer.getvalue()


def _png(image: Image.Image) -> bytes:
    buffer = io.BytesIO()
    image.save(buffer, "PNG")
    return buffer.getvalue()


def _open(data: bytes) -> Image.Image:
    image = Image.open(io.BytesIO(data))
    image.load()
    return image


def _near(pixel, colour, tolerance=40) -> bool:
    return all(abs(a - b) <= tolerance for a, b in zip(pixel[:3], colour))


def _noise(width, height) -> Image.Image:
    return Image.frombytes("RGB", (width, height), os.urandom(width * height * 3))


# --- what the bytes say ------------------------------------------------------

@pytest.mark.parametrize(
    ("head", "expected"),
    [
        (b"\xff\xd8\xff\xe0" + b"\0" * 8, "jpeg"),
        (b"\x89PNG\r\n\x1a\n" + b"\0" * 4, "png"),
        (b"RIFF\0\0\0\0WEBP", "webp"),
        (b"%PDF-1.7\n", "pdf"),
        (b"\0\0\0\x18ftypheic\0\0\0\0", "heic"),
        (b"\0\0\0\x18ftypmif1\0\0\0\0", "heic"),
        (b"\0\0\0\x18ftypavif\0\0\0\0", "avif"),
        # An MP4 shares the ftyp box with HEIC; it is not a photo.
        (b"\0\0\0\x18ftypisom\0\0\0\0", "unknown"),
        # JPEG is three specific bytes, not "starts with 0xFF".
        (b"\xff\x00\x00\x00", "unknown"),
        (b"", "unknown"),
    ],
    ids=["jpeg", "png", "webp", "pdf", "heic", "heif-mif1", "avif", "mp4", "ff-not-jpeg", "empty"],
)
def test_the_type_comes_from_the_bytes(head, expected):
    assert sniff(head) == expected


# --- the large real file: stored files never exceed the limits ---------------

@pytest.fixture(scope="module")
def phone_sized_noise() -> bytes:
    """8064 x 6048 (48 MP, a current iPhone's full sensor) of pure noise at
    q95 — about 57 MB, three times the 18.7 MB photo a real iPhone sent."""
    return _jpeg(_noise(8064, 6048), quality=95)


def test_the_large_file_is_really_large(phone_sized_noise):
    assert len(phone_sized_noise) > 40 * 1024 * 1024


def test_a_huge_upload_is_stored_within_every_limit(phone_sized_noise):
    prepared = prepare(phone_sized_noise, LIMITS)
    original, for_ai = prepared.original, prepared.for_ai

    assert max(original.width_px, original.height_px) == 3000
    assert original.bytes <= LIMITS.stored_max_bytes
    assert max(for_ai.width_px, for_ai.height_px) == 1600
    assert for_ai.bytes <= LIMITS.stored_max_bytes
    assert original.reencoded and for_ai.reencoded

    # The stored bytes really are the size they claim.
    assert _open(original.data).size == (original.width_px, original.height_px)
    assert _open(for_ai.data).size == (for_ai.width_px, for_ai.height_px)


def test_the_source_is_recorded_exactly(phone_sized_noise):
    source = prepare(phone_sized_noise, LIMITS).source
    assert source.content_type == "image/jpeg"
    assert source.bytes == len(phone_sized_noise)
    assert (source.width_px, source.height_px) == (8064, 6048)
    assert source.sha256 == hashlib.sha256(phone_sized_noise).hexdigest()


def test_a_square_worst_case_still_fits_the_bucket():
    """3000 x 3000 of noise is the largest the evidence copy can be (7.5 MB
    measured); fed in at q100 so it has to be re-encoded to fit."""
    data = _jpeg(_noise(3000, 3000), quality=100)
    assert len(data) > LIMITS.stored_max_bytes, "the input must start over the limit"
    original = prepare(data, LIMITS).original
    assert original.reencoded
    assert original.bytes <= LIMITS.stored_max_bytes


# --- stored as it arrived only when every condition holds -------------------

def test_a_small_upright_jpeg_is_kept_byte_for_byte():
    data = _jpeg(Image.new("RGB", (1200, 900), WHITE))
    prepared = prepare(data, LIMITS)
    for stored in (prepared.original, prepared.for_ai):
        assert stored.data == data
        assert stored.reencoded is False
        assert (stored.width_px, stored.height_px) == (1200, 900)


def test_between_the_two_limits_only_the_ai_copy_is_shrunk():
    data = _jpeg(Image.new("RGB", (2400, 1800), WHITE))
    prepared = prepare(data, LIMITS)
    assert prepared.original.data == data and prepared.original.reencoded is False
    assert prepared.for_ai.reencoded is True
    assert (prepared.for_ai.width_px, prepared.for_ai.height_px) == (1600, 1200)


def test_a_jpeg_within_the_edge_but_over_the_bytes_is_reencoded():
    data = _jpeg(_noise(1000, 800), quality=95)
    limits = Limits(3000, 88, 1600, 80, stored_max_bytes=len(data) - 1)
    prepared = prepare(data, limits)
    assert prepared.original.reencoded is True
    assert prepared.original.bytes < len(data)


def test_a_png_becomes_a_jpeg_even_when_small():
    data = _png(Image.new("RGB", (800, 600), WHITE))
    prepared = prepare(data, LIMITS)
    assert prepared.source.content_type == "image/png"
    for stored in (prepared.original, prepared.for_ai):
        assert stored.content_type == "image/jpeg"
        assert stored.reencoded is True
        assert sniff(stored.data) == "jpeg"


def test_transparency_is_laid_on_white_not_black():
    image = Image.new("RGBA", (400, 300), (0, 0, 0, 0))
    stored = prepare(_png(image), LIMITS).original
    assert _near(_open(stored.data).getpixel((200, 150)), WHITE)


# --- EXIF orientation: stored upright ----------------------------------------

def _marked_upright() -> Image.Image:
    """How the page should look: red across the top, blue across the bottom,
    and a red block in the top-left corner so a mirror image is told apart
    from the right one."""
    image = Image.new("RGB", (600, 400), WHITE)
    image.paste(RED, (0, 0, 600, 80))
    image.paste(BLUE, (0, 320, 600, 400))
    image.paste(RED, (0, 0, 120, 200))
    return image


# How a camera stores pixels for each EXIF orientation: the raw pixels are the
# upright picture turned the other way, and the tag says how to turn it back.
_CAMERA_STORES = {
    2: Image.Transpose.FLIP_LEFT_RIGHT,
    3: Image.Transpose.ROTATE_180,
    4: Image.Transpose.FLIP_TOP_BOTTOM,
    5: Image.Transpose.TRANSPOSE,
    6: Image.Transpose.ROTATE_90,
    7: Image.Transpose.TRANSVERSE,
    8: Image.Transpose.ROTATE_270,
}


def _camera_jpeg(orientation: int) -> bytes:
    raw = _marked_upright().transpose(_CAMERA_STORES[orientation])
    exif = Image.Exif()
    exif[0x0112] = orientation
    return _jpeg(raw, quality=95, exif=exif.tobytes())


@pytest.mark.parametrize("orientation", sorted(_CAMERA_STORES))
def test_a_photo_the_camera_stored_turned_is_stored_upright(orientation):
    data = _camera_jpeg(orientation)
    # The file really carries the tag — read back by Pillow's own reader.
    assert Image.open(io.BytesIO(data)).getexif().get(0x0112) == orientation

    prepared = prepare(data, LIMITS)
    for stored in (prepared.original, prepared.for_ai):
        assert stored.reencoded is True, "a turned photo must not be kept as it came"
        image = _open(stored.data)
        assert image.size == (600, 400)
        assert _near(image.getpixel((300, 30)), RED), "top edge should be red"
        assert _near(image.getpixel((300, 370)), BLUE), "bottom edge should be blue"
        assert _near(image.getpixel((40, 150)), RED), "red block should be top-left"
        assert _near(image.getpixel((560, 150)), WHITE), "not mirrored"
        # And the tag is gone, so no viewer turns it a second time.
        assert image.getexif().get(0x0112, 1) == 1


def test_the_source_keeps_the_dimensions_the_file_itself_has():
    """Orientation 6 is how a phone held upright stores a portrait photo:
    the file is 400 wide, 600 tall; the page is 600 wide once turned."""
    source = prepare(_camera_jpeg(6), LIMITS).source
    assert (source.width_px, source.height_px) == (400, 600)


def test_orientation_1_is_upright_and_kept():
    exif = Image.Exif()
    exif[0x0112] = 1
    data = _jpeg(_marked_upright(), exif=exif.tobytes())
    assert prepare(data, LIMITS).original.data == data


# --- what is refused ---------------------------------------------------------

@pytest.mark.parametrize(
    ("data", "sniffed"),
    [
        (b"\0\0\0\x18ftypheic\0\0\0\0" + b"\0" * 64, "heic"),
        (b"%PDF-1.7\n" + b"\0" * 64, "pdf"),
        (b"\0\0\0\x18ftypisom\0\0\0\0" + b"\0" * 64, "unknown"),
        (b"just some text, not a picture", "unknown"),
    ],
    ids=["heic", "pdf", "mp4", "text"],
)
def test_what_is_not_a_supported_image_is_refused(data, sniffed):
    with pytest.raises(ImageRejected) as caught:
        prepare(data, LIMITS)
    assert (caught.value.reason, caught.value.sniffed) == ("unsupported", sniffed)


@pytest.mark.parametrize("size", [(800, 600), (4000, 3000)], ids=["kept-path", "shrink-path"])
def test_a_cut_off_jpeg_is_refused_not_stored(size):
    whole = _jpeg(_noise(*size))
    with pytest.raises(ImageRejected) as caught:
        prepare(whole[: len(whole) // 2], LIMITS)
    assert caught.value.reason == "unreadable"


def test_a_shrink_that_still_does_not_fit_is_refused():
    with pytest.raises(ImageRejected) as caught:
        prepare(_png(_noise(800, 600)), Limits(3000, 88, 1600, 80, stored_max_bytes=1000))
    assert caught.value.reason == "too_large_after_shrink"
