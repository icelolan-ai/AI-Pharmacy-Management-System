"""A person reviewing a read scan, on the real test database (6.4 · migration 015).

Chat A's assertions: a changed value leaves the AI's own answer whole;
going on is refused while a field below D57's line is untouched, at both
levels (0.90 and 0.80); the corrections table is append-only in the
database itself; touching again is a new row; rejecting keeps everything.
"""

import psycopg
import pytest

from app import db
from app.schemas.invoice_scan import CorrectionOut, FieldOut, RejectedOut, ReviewDoneOut, ScanDetailOut
from tests.fake_invoice_answers import answer_for, as_text, changed, read
from tests.integration.conftest import OWNER_ID, api
from tests.integration.test_invoice_extraction_db import (  # noqa: F401
    FakeAI, _draft_purchase, _write, ai, extract, scan_row, scan_with, storage,
)
from tests.integration.test_invoice_scans_db import _objects, _rows

pytestmark = pytest.mark.db
BASE = "/api/v1/invoice-scans"


def settled(change=None):
    """Fake A with a due date that settles its header date (D87), so the only
    fields to touch are the carried name of line 4 and what `change` adds."""
    def apply(a):
        a["due_date"] = read("30/09/2569")
        if change:
            change(a)
    return changed("fake-a", apply)


def read_scan(client, ai_fixture, answer) -> str:
    ai_fixture(FakeAI(as_text(answer)))
    scan_id = scan_with(client)
    assert extract(client, scan_id).json()["status"] == "needs_review"
    return scan_id


def touch(client, scan_id, path, action="confirmed", value=None, role="owner"):
    body = {"field_path": path, "action": action}
    if value is not None or action == "changed":
        body["person_value"] = value
    return api(client, "post", f"{BASE}/{scan_id}/fields", role, json=body)


def detail(client, scan_id) -> dict:
    return api(client, "get", f"{BASE}/{scan_id}").json()


def corrections(scan_id) -> list[dict]:
    with db.get_transaction() as cur:
        cur.execute("SELECT * FROM public.invoice_scan_corrections WHERE scan_id = %s ORDER BY changed_at, id",
                    (scan_id,))
        return cur.fetchall()


# --- 🔴 the AI's answer stays whole -------------------------------------------

def test_a_changed_value_leaves_the_ais_answer_whole(client, storage, ai):
    scan_id = read_scan(client, ai, settled())
    before = scan_row(scan_id)["extracted"]
    response = touch(client, scan_id, "lines.1.quantity", "changed", "12")
    assert response.status_code == 201, response.text
    assert set(FieldOut.model_fields) <= set(response.json())
    assert scan_row(scan_id)["extracted"] == before, "the AI's answer was written to"
    row = corrections(scan_id)[0]
    assert row["ai_value"] == before["ai"]["lines"][0]["quantity"]
    assert (row["shown_value"], row["person_value"], row["action"]) == ("10", "12", "changed")
    assert row["changed_by"] == OWNER_ID and row["changed_at"] is not None


def test_touching_again_is_a_new_row_and_the_latest_counts(client, storage, ai):
    scan_id = read_scan(client, ai, settled())
    touch(client, scan_id, "lines.1.quantity", "changed", "12")
    touch(client, scan_id, "lines.1.quantity", "changed", "11")
    touch(client, scan_id, "lines.1.quantity", "confirmed")
    rows = corrections(scan_id)
    assert [(r["person_value"], r["action"]) for r in rows] == [("12", "changed"), ("11", "changed"), ("10", "confirmed")]
    now = {c["field_path"]: c for c in detail(client, scan_id)["corrections"]}
    assert set(CorrectionOut.model_fields) <= set(now["lines.1.quantity"])
    assert now["lines.1.quantity"]["person_value"] == "10"


# --- 🔴 append-only in the database itself (Chat A condition 1) ------------------

def test_the_database_refuses_to_update_a_correction(client, storage, ai):
    scan_id = read_scan(client, ai, settled())
    touch(client, scan_id, "lines.1.quantity", "changed", "12")
    with pytest.raises(psycopg.errors.CheckViolation):
        _write("UPDATE public.invoice_scan_corrections SET person_value = '99' WHERE scan_id = %s", (scan_id,))
    assert corrections(scan_id)[0]["person_value"] == "12"


def test_the_database_refuses_to_delete_a_correction_on_its_own(client, storage, ai):
    scan_id = read_scan(client, ai, settled())
    touch(client, scan_id, "lines.1.quantity", "changed", "12")
    with pytest.raises(psycopg.errors.CheckViolation):
        _write("DELETE FROM public.invoice_scan_corrections WHERE scan_id = %s", (scan_id,))
    assert len(corrections(scan_id)) == 1


def test_corrections_go_only_with_their_whole_scan(client, storage, ai):
    scan_id = read_scan(client, ai, settled())
    touch(client, scan_id, "lines.1.quantity", "changed", "12")
    assert api(client, "delete", f"{BASE}/{scan_id}").status_code == 200
    assert corrections(scan_id) == [] and _objects() == []


@pytest.mark.parametrize("status", ["converted", "rejected"])
def test_the_database_refuses_to_delete_a_scan_that_is_evidence(client, storage, today, status):
    scan_id = scan_with(client)
    if status == "converted":
        _write("UPDATE public.invoice_scans SET status = 'converted', purchase_id = %s WHERE id = %s",
               (_draft_purchase(client, today), scan_id))
    else:
        _write("UPDATE public.invoice_scans SET status = 'rejected', rejected_reason = 'ซ้ำ', rejected_by = %s,"
               " rejected_at = now() WHERE id = %s", (OWNER_ID, scan_id))
    with pytest.raises(psycopg.errors.CheckViolation):
        _write("DELETE FROM public.invoice_scans WHERE id = %s", (scan_id,))
    assert scan_row(scan_id) is not None and len(_rows(scan_id)) == 4


def test_confirmed_must_equal_what_was_shown_in_the_database(client, storage, ai):
    scan_id = read_scan(client, ai, settled())
    ai_value = scan_row(scan_id)["extracted"]["ai"]["lines"][0]["quantity"]
    with pytest.raises(psycopg.errors.CheckViolation):
        _write("INSERT INTO public.invoice_scan_corrections (scan_id, field_path, ai_value, shown_value,"
               " person_value, action, changed_by) VALUES (%s, 'lines.1.quantity', %s, '10', NULL, 'confirmed', %s)",
               (scan_id, psycopg.types.json.Jsonb(ai_value), OWNER_ID))


# --- 🔴 going on (D57 · D85 · D87) ---------------------------------------------

def touch_all_but(client, scan_id, skip: str) -> None:
    for path in detail(client, scan_id)["untouched"]:
        if path != skip:
            assert touch(client, scan_id, path).status_code == 201, path


@pytest.mark.parametrize("field,confidence,path", [
    ("quantity", 0.85, "lines.1.quantity"),   # 0.90 level: quantity, money, expiry
    ("exp", 0.89, "lines.1.exp"),
    ("lot", 0.79, "lines.1.lot"),             # 0.80 level: everything else
])
def test_going_on_is_refused_while_a_field_below_the_line_is_untouched(client, storage, ai, field, confidence, path):
    text = answer_for("fake-a")["lines"][0][field]["text"]
    scan_id = read_scan(client, ai, settled(lambda a: a["lines"][0].update({field: read(text, confidence)})))
    assert path in detail(client, scan_id)["untouched"]
    touch_all_but(client, scan_id, path)
    refused = api(client, "post", f"{BASE}/{scan_id}/review-done")
    assert refused.status_code == 409 and refused.json()["error"]["details"]["untouched"] == [path]
    assert scan_row(scan_id)["reviewed_at"] is None
    assert touch(client, scan_id, path).status_code == 201
    done = api(client, "post", f"{BASE}/{scan_id}/review-done")
    assert done.status_code == 200 and set(ReviewDoneOut.model_fields) <= set(done.json())
    assert scan_row(scan_id)["reviewed_by"] == OWNER_ID


def test_a_field_above_the_line_is_not_required(client, storage, ai):
    scan_id = read_scan(client, ai, settled(lambda a: a["lines"][0].update(lot=read("FK2401", 0.85))))
    assert "lines.1.lot" not in detail(client, scan_id)["untouched"]


def test_a_reviewed_scan_takes_no_more_touches(client, storage, ai):
    scan_id = read_scan(client, ai, settled())
    touch_all_but(client, scan_id, "")
    assert api(client, "post", f"{BASE}/{scan_id}/review-done").status_code == 200
    assert touch(client, scan_id, "lines.1.quantity", "changed", "12").status_code == 409


# --- what may be confirmed or changed ---------------------------------------------

def test_an_open_date_cannot_be_confirmed_empty(client, storage, ai):
    """D87: a header date read two ways with no suggestion must be chosen."""
    scan_id = read_scan(client, ai, changed("fake-a", lambda a: a.update(doc_date=read("04/09/2569"))))
    with db.get_transaction() as cur:
        cur.execute("UPDATE public.invoice_scans SET extracted = jsonb_set(extracted, '{derived,doc_date,suggested}',"
                    " 'null') WHERE id = %s", (scan_id,))
    assert touch(client, scan_id, "header.doc_date").status_code == 400
    assert touch(client, scan_id, "header.doc_date", "changed", "2026-09-04").status_code == 201


def test_a_suggested_date_is_confirmed_once(client, storage, ai):
    scan_id = read_scan(client, ai, answer_for("fake-a"))
    suggested = scan_row(scan_id)["extracted"]["derived"]["doc_date"]["suggested"]
    assert suggested and "header.doc_date" in detail(client, scan_id)["untouched"]
    response = touch(client, scan_id, "header.doc_date")
    assert response.json()["person_value"] == suggested
    assert "header.doc_date" not in response.json()["untouched"]


def test_a_field_not_on_the_paper_can_be_confirmed_as_none(client, storage, ai):
    scan_id = read_scan(client, ai, settled())
    response = touch(client, scan_id, "lines.1.line_discount")
    assert response.status_code == 201 and response.json()["person_value"] is None


@pytest.mark.parametrize("path,value,stored", [
    ("lines.1.exp", "2027-01-31", "2027-01-31"), ("lines.1.unit_price", "36", "36.00"),
    ("lines.1.unit_price", "1,036.5", "1036.50"), ("totals.boxes.0", "1036.00", None),
    ("lines.1.name", "  พาราเซตามอล 500  ", "พาราเซตามอล 500"),
])
def test_a_changed_value_is_kept_in_the_pages_own_form(client, storage, ai, path, value, stored):
    scan_id = read_scan(client, ai, settled())
    response = touch(client, scan_id, path, "changed", value)
    if stored is None:   # the same as shown: confirm it instead
        assert response.status_code == 400
    else:
        assert response.status_code == 201 and response.json()["person_value"] == stored


@pytest.mark.parametrize("path,value", [
    ("lines.1.exp", "31/01/2027"), ("lines.1.quantity", "0"), ("lines.1.quantity", "สิบ"),
    ("lines.1.unit_price", "-1"), ("lines.1.unit_price", "1.005"), ("lines.9.name", "x"),
    ("header.bank_account", "x"), ("totals.boxes.9", "1.00"), ("lines.1.secret", "x"),
])
def test_a_bad_value_or_an_unknown_field_is_refused(client, storage, ai, path, value):
    scan_id = read_scan(client, ai, settled())
    assert touch(client, scan_id, path, "changed", value).status_code == 400
    assert corrections(scan_id) == []


# --- rejecting (D58) ------------------------------------------------------------------

def test_rejecting_needs_a_reason_and_keeps_everything(client, storage, ai):
    scan_id = read_scan(client, ai, settled())
    touch(client, scan_id, "lines.1.quantity", "changed", "12")
    assert api(client, "post", f"{BASE}/{scan_id}/reject", json={"reason": "   "}).status_code == 400
    response = api(client, "post", f"{BASE}/{scan_id}/reject", json={"reason": "ใบซ้ำกับที่รับไปแล้ว"})
    assert response.status_code == 200 and set(RejectedOut.model_fields) <= set(response.json())
    row = scan_row(scan_id)
    assert (row["status"], row["rejected_reason"], row["rejected_by"]) == ("rejected", "ใบซ้ำกับที่รับไปแล้ว", OWNER_ID)
    assert len(_rows(scan_id)) == 4 and len(_objects()) == 4 and len(corrections(scan_id)) == 1
    assert api(client, "delete", f"{BASE}/{scan_id}").status_code == 409


def test_a_converted_scan_cannot_be_rejected(client, storage, today):
    scan_id = scan_with(client)
    _write("UPDATE public.invoice_scans SET status = 'converted', purchase_id = %s WHERE id = %s",
           (_draft_purchase(client, today), scan_id))
    assert api(client, "post", f"{BASE}/{scan_id}/reject", json={"reason": "x"}).status_code == 409


def test_the_detail_shows_the_review(client, storage, ai):
    scan_id = read_scan(client, ai, settled())
    body = detail(client, scan_id)
    assert set(ScanDetailOut.model_fields) <= set(body)   # D36
    assert body["untouched"] == ["lines.4.name"] and body["corrections"] == []


@pytest.mark.parametrize("method,path,payload", [
    ("post", "/fields", {"field_path": "lines.1.quantity", "action": "confirmed"}),
    ("post", "/review-done", None), ("post", "/reject", {"reason": "x"})])
def test_staff_cannot_review(client, storage, ai, method, path, payload):
    scan_id = read_scan(client, ai, settled())
    kwargs = {"json": payload} if payload else {}
    assert api(client, method, f"{BASE}/{scan_id}{path}", "staff", **kwargs).status_code == 403


def test_a_scan_read_by_the_stand_in_says_so(client, storage, monkeypatch):
    """Chat A: the review page must show it was not read by AI."""
    from app.ai.stand_in import PROVIDER_NAME, StandInProvider
    from app.config import Settings
    from app.services import invoice_extraction

    on = Settings(_env_file=None, database_url="postgresql://unused", supabase_url="https://unused.supabase.co",
                  app_env="development", ai_stand_in_enabled=True)
    monkeypatch.setattr(invoice_extraction, "get_provider", lambda: StandInProvider(on))
    scan_id = scan_with(client)
    assert extract(client, scan_id).json()["status"] == "needs_review"
    body = detail(client, scan_id)
    assert body["provider"] == PROVIDER_NAME
    assert "lines.1.lot" in body["untouched"]
