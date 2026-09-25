"""invoice_scan_images holds one row per file, told apart by kind (D68 · 011).

The table is what makes "only the for_ai copy goes to the AI" enforceable: a
row either is the original or is the copy, and it cannot be both or neither.
These tests hold the table to that shape on the test project.
"""

import psycopg
import pytest

from app import db

pytestmark = pytest.mark.db


def _scan() -> str:
    with db.get_transaction() as cur:
        cur.execute("INSERT INTO public.invoice_scans DEFAULT VALUES RETURNING id")
        return cur.fetchone()["id"]


SHA = "a" * 64

# What arrived: a 900 x 600 JPEG of 5000 bytes.
SOURCE = {"source_bytes": 5000, "source_width_px": 900, "source_height_px": 600}


def _image(scan_id, page_no, kind, path="p.jpg", **overrides):
    """One row, unchanged from its upload unless overrides say otherwise."""
    row = {
        "bytes": 5000,
        "width_px": 900,
        "height_px": 600,
        "reencoded": False,
        "source_sha256": SHA,
        **SOURCE,
        **overrides,
    }
    with db.get_transaction() as cur:
        cur.execute(
            "INSERT INTO public.invoice_scan_images"
            " (scan_id, page_no, kind, storage_path, content_type, bytes, width_px, height_px,"
            "  source_content_type, source_bytes, source_width_px, source_height_px,"
            "  source_sha256, reencoded)"
            " VALUES (%s, %s, %s, %s, 'image/jpeg', %s, %s, %s, 'image/jpeg', %s, %s, %s, %s, %s)",
            (
                scan_id, page_no, kind, path, row["bytes"], row["width_px"], row["height_px"],
                row["source_bytes"], row["source_width_px"], row["source_height_px"],
                row["source_sha256"], row["reencoded"],
            ),
        )


def test_a_page_holds_one_original_and_one_for_ai_copy():
    scan_id = _scan()
    _image(scan_id, 1, "original", "a.jpg")
    _image(scan_id, 1, "for_ai", "b.jpg")
    with db.get_transaction() as cur:
        cur.execute(
            "SELECT kind FROM public.invoice_scan_images WHERE scan_id = %s ORDER BY kind", (scan_id,)
        )
        assert [r["kind"] for r in cur.fetchall()] == ["for_ai", "original"]


def test_a_second_original_for_the_same_page_is_refused():
    scan_id = _scan()
    _image(scan_id, 1, "original", "a.jpg")
    with pytest.raises(psycopg.errors.UniqueViolation):
        _image(scan_id, 1, "original", "c.jpg")


@pytest.mark.parametrize("kind", ["thumbnail", "ORIGINAL", ""])
def test_kind_is_only_ever_original_or_for_ai(kind):
    scan_id = _scan()
    with pytest.raises(psycopg.errors.CheckViolation):
        _image(scan_id, 1, kind)


def test_kind_must_be_stated_there_is_no_default():
    """A row that does not say what it is could be sent anywhere."""
    scan_id = _scan()
    with pytest.raises(psycopg.errors.NotNullViolation):
        with db.get_transaction() as cur:
            cur.execute(
                "INSERT INTO public.invoice_scan_images"
                " (scan_id, page_no, storage_path, content_type, bytes, width_px, height_px,"
                "  source_content_type, source_bytes, source_width_px, source_height_px,"
                "  source_sha256, reencoded)"
                " VALUES (%s, 1, 'x.jpg', 'image/jpeg', 5000, 900, 600,"
                "         'image/jpeg', 5000, 900, 600, %s, false)",
                (scan_id, SHA),
            )


# --- 012: the stored file says where it came from, and cannot lie about it --

def test_a_file_stored_as_it_arrived_is_accepted():
    _image(_scan(), 1, "original")


@pytest.mark.parametrize(
    "changed",
    [{"bytes": 4000}, {"width_px": 600}, {"height_px": 900}],
    ids=["smaller", "narrower", "turned"],
)
def test_claiming_not_reencoded_when_the_numbers_differ_is_refused(changed):
    """The bug this guards: the code shrinks a photo and forgets to say so.
    The row would then call a changed file the phone's own bytes."""
    with pytest.raises(psycopg.errors.CheckViolation):
        _image(_scan(), 1, "original", **changed)


def test_a_reencoded_file_may_differ_from_its_source():
    _image(_scan(), 1, "original", bytes=1200, width_px=600, height_px=400, reencoded=True)


def test_whether_it_was_reencoded_must_be_stated():
    scan_id = _scan()
    with pytest.raises(psycopg.errors.NotNullViolation):
        with db.get_transaction() as cur:
            cur.execute(
                "INSERT INTO public.invoice_scan_images"
                " (scan_id, page_no, kind, storage_path, content_type, bytes, width_px, height_px,"
                "  source_content_type, source_bytes, source_width_px, source_height_px,"
                "  source_sha256)"
                " VALUES (%s, 1, 'original', 'x.jpg', 'image/jpeg', 5000, 900, 600,"
                "         'image/jpeg', 5000, 900, 600, %s)",
                (scan_id, SHA),
            )


@pytest.mark.parametrize(
    "sha",
    ["A" * 64, "a" * 63, "g" * 64, ""],
    ids=["uppercase", "short", "not-hex", "empty"],
)
def test_the_fingerprint_is_a_full_lowercase_sha256(sha):
    with pytest.raises(psycopg.errors.CheckViolation):
        _image(_scan(), 1, "original", source_sha256=sha)


@pytest.mark.parametrize("column", ["width_px", "height_px"])
def test_every_stored_file_has_dimensions(column):
    """Images only since 012 — a file with no size is not one of ours."""
    with pytest.raises(psycopg.errors.NotNullViolation):
        _image(_scan(), 1, "original", reencoded=True, **{column: None})
