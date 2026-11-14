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
PICTURE = "b" * 64

# What arrived: a 900 x 600 JPEG of 5000 bytes.
SOURCE = {"source_bytes": 5000, "source_width_px": 900, "source_height_px": 600}


def _image(scan_id, page_no, kind, path="p.jpg", **overrides):
    """One row, unchanged from its upload unless overrides say otherwise.
    A column given as ... is left out of the INSERT entirely."""
    row = {
        "scan_id": scan_id,
        "page_no": page_no,
        "kind": kind,
        "storage_path": path,
        "content_type": "image/jpeg",
        "bytes": 5000,
        "width_px": 900,
        "height_px": 600,
        "source_content_type": "image/jpeg",
        **SOURCE,
        "source_sha256": SHA,
        "reencoded": False,
        "picture_sha256": PICTURE,
        "source_picture_sha256": PICTURE,
        "client_reported_resized": False,
        **overrides,
    }
    row = {k: v for k, v in row.items() if v is not ...}
    with db.get_transaction() as cur:
        cur.execute(
            "INSERT INTO public.invoice_scan_images (" + ", ".join(row) + ")"
            " VALUES (" + ", ".join(["%s"] * len(row)) + ")",
            tuple(row.values()),
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
    with pytest.raises(psycopg.errors.NotNullViolation):
        _image(_scan(), 1, ...)


# --- 012: the stored file says where it came from, and cannot lie about it --

def test_a_file_stored_as_it_arrived_is_accepted():
    _image(_scan(), 1, "original")


@pytest.mark.parametrize(
    "changed",
    [
        {"width_px": 600},
        {"height_px": 900},
        # 013: the picture itself changed — a table or a pixel touched while
        # trimming the header — however the code described it.
        {"picture_sha256": "c" * 64},
        # 013 · Chat A: an unknown fingerprint cannot vouch for anything.
        {"picture_sha256": None},
        {"source_picture_sha256": None},
        {"picture_sha256": None, "source_picture_sha256": None},
    ],
    ids=["narrower", "turned", "picture-changed", "stored-unknown", "source-unknown", "both-unknown"],
)
def test_claiming_not_reencoded_when_the_picture_differs_is_refused(changed):
    """The bug this guards: the code changes a photo and says it did not.
    The row would then call a changed picture the one that arrived."""
    with pytest.raises(psycopg.errors.CheckViolation):
        _image(_scan(), 1, "original", **changed)


def test_a_trimmed_header_with_the_same_picture_is_not_reencoded():
    """013: GPS or all metadata removed — fewer bytes, same picture."""
    _image(_scan(), 1, "original", bytes=4000)


def test_a_new_row_must_carry_its_picture_fingerprint():
    """Even re-encoded: every stored file is a JPEG, so it can be known."""
    with pytest.raises(psycopg.errors.CheckViolation):
        _image(_scan(), 1, "original", reencoded=True, picture_sha256=None, source_picture_sha256=None)


def test_a_reencoded_row_may_not_know_its_source_picture():
    """A PNG upload has no JPEG picture fingerprint."""
    _image(_scan(), 1, "original", reencoded=True, source_picture_sha256=None,
           source_content_type="image/png")


def test_whether_the_phone_shrank_it_must_be_stated():
    """D75: no default, though what is stated cannot be checked (D69)."""
    with pytest.raises(psycopg.errors.NotNullViolation):
        _image(_scan(), 1, "original", client_reported_resized=...)


def test_a_reencoded_file_may_differ_from_its_source():
    _image(_scan(), 1, "original", bytes=1200, width_px=600, height_px=400, reencoded=True)


def test_whether_it_was_reencoded_must_be_stated():
    with pytest.raises(psycopg.errors.NotNullViolation):
        _image(_scan(), 1, "original", reencoded=...)


@pytest.mark.parametrize(
    "sha",
    ["A" * 64, "a" * 63, "g" * 64, ""],
    ids=["uppercase", "short", "not-hex", "empty"],
)
@pytest.mark.parametrize("column", ["source_sha256", "picture_sha256", "source_picture_sha256"])
def test_the_fingerprint_is_a_full_lowercase_sha256(sha, column):
    with pytest.raises(psycopg.errors.CheckViolation):
        _image(_scan(), 1, "original", reencoded=True, **{column: sha})


@pytest.mark.parametrize("column", ["width_px", "height_px"])
def test_every_stored_file_has_dimensions(column):
    """Images only since 012 — a file with no size is not one of ours."""
    with pytest.raises(psycopg.errors.NotNullViolation):
        _image(_scan(), 1, "original", reencoded=True, **{column: None})
