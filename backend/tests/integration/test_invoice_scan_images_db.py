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


def _image(scan_id, page_no, kind, path="p.jpg"):
    with db.get_transaction() as cur:
        cur.execute(
            "INSERT INTO public.invoice_scan_images"
            " (scan_id, page_no, kind, storage_path, content_type, bytes)"
            " VALUES (%s, %s, %s, %s, 'image/jpeg', 100)",
            (scan_id, page_no, kind, path),
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
                " (scan_id, page_no, storage_path, content_type, bytes)"
                " VALUES (%s, 1, 'x.jpg', 'image/jpeg', 100)",
                (scan_id,),
            )
