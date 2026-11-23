"""Matching a reviewed scan to a supplier and medicines, on the real test
database (6.5 · migration 016).

Chat A's assertions: a wrong memory corrected is what the next invoice
proposes; a name that differs only in spacing finds the memory; a
contradicting medicine is never proposed, and choosing one by hand needs a
second confirmation with both values shown; memory is append-only.
"""

import psycopg
import pytest

from app import db
from app.schemas.invoice_scan import MatchesOut
from tests.fake_invoice_answers import as_text, changed, read
from tests.integration.conftest import api, insert_medicine, insert_supplier
from tests.integration.test_invoice_extraction_db import FakeAI, _write, ai, extract, scan_with, storage  # noqa: F401

pytestmark = pytest.mark.db
BASE = "/api/v1/invoice-scans"
SUPPLIER = "บริษัท ปลอมเพื่อทดสอบ ฟาร์มา จำกัด (FAKE)"


def medicine(name, strength=None, form=None, unit="กล่อง"):
    medicine_id = insert_medicine(name)
    _write("UPDATE public.medicines SET strength = %s, dosage_form = %s, unit = %s WHERE id = %s",
           (strength, form, unit, medicine_id))
    return str(medicine_id)


@pytest.fixture
def shop():
    return {
        "supplier": str(insert_supplier("บริษัท ปลอมเพื่อทดสอบ ฟาร์มา จำกัด")),
        "p500": medicine("พาราเซตามอล 500 มก. 10x10", "500 mg", "เม็ด"),
        "p500b": medicine("พาราเซตามอล 500 มก. 10x10 (ยี่ห้อ ข)", "500 mg", "เม็ด"),
        "p250": medicine("พาราเซตามอล 250 มก. 10x10", "250 mg", "เม็ด"),
    }


def reviewed_scan(client, ai_fixture, change=None) -> str:
    """Fake A read, its due date settling the header date, every must-check
    field confirmed, review done — ready for matching."""
    def apply(a):
        a["due_date"] = read("30/09/2569")
        if change:
            change(a)
    ai_fixture(FakeAI(as_text(changed("fake-a", apply))))
    scan_id = scan_with(client)
    assert extract(client, scan_id).json()["status"] == "needs_review"
    for path in api(client, "get", f"{BASE}/{scan_id}").json()["untouched"]:
        assert api(client, "post", f"{BASE}/{scan_id}/fields", json={"field_path": path, "action": "confirmed"}).status_code == 201
    assert api(client, "post", f"{BASE}/{scan_id}/review-done").status_code == 200
    return scan_id


def choose(client, scan_id, target, chosen_id, line_no=None, confirm=False, role="owner"):
    body = {"target": target, "chosen_id": chosen_id, "confirm_conflict": confirm}
    if line_no:
        body["line_no"] = line_no
    return api(client, "post", f"{BASE}/{scan_id}/matches", role, json=body)


def line(state, n):
    return next(entry for entry in state["lines"] if entry["line_no"] == n)


# --- order and rights ------------------------------------------------------------

def test_matching_waits_for_the_review(client, storage, ai):
    ai(FakeAI(as_text(changed("fake-a", lambda a: a.update(due_date=read("30/09/2569"))))))
    scan_id = scan_with(client)
    extract(client, scan_id)
    assert api(client, "get", f"{BASE}/{scan_id}/matches").status_code == 409


def test_the_supplier_comes_first(client, storage, ai, shop):
    scan_id = reviewed_scan(client, ai)
    state = api(client, "get", f"{BASE}/{scan_id}/matches").json()
    assert set(MatchesOut.model_fields) <= set(state)   # D36
    assert line(state, 1)["proposals"] == []          # nothing proposed before the supplier
    assert choose(client, scan_id, "line", shop["p500"], line_no=1).status_code == 409
    assert state["supplier"]["proposals"][0]["id"] == shop["supplier"]


def test_staff_cannot_match(client, storage, ai, shop):
    scan_id = reviewed_scan(client, ai)
    assert api(client, "get", f"{BASE}/{scan_id}/matches", "staff").status_code == 403
    assert choose(client, scan_id, "supplier", shop["supplier"], role="staff").status_code == 403


# --- proposals (D52 · Chat A ข.) -------------------------------------------------------

def test_a_contradicting_strength_is_never_proposed(client, storage, ai, shop):
    scan_id = reviewed_scan(client, ai)
    state = choose(client, scan_id, "supplier", shop["supplier"]).json()
    ids = [p["id"] for p in line(state, 1)["proposals"]]
    assert shop["p250"] not in ids and ids[:1] in ([shop["p500"]], [shop["p500b"]])
    assert len(ids) <= 3 and all(p["reasons"] for p in line(state, 1)["proposals"])


def test_choosing_a_contradicting_medicine_needs_a_second_confirmation(client, storage, ai, shop):
    scan_id = reviewed_scan(client, ai)
    choose(client, scan_id, "supplier", shop["supplier"])
    refused = choose(client, scan_id, "line", shop["p250"], line_no=1)
    assert refused.status_code == 409
    assert refused.json()["error"]["details"]["conflicts"] == [{"what": "strength", "paper": "500 mg", "system": "250 mg"}]
    state = choose(client, scan_id, "line", shop["p250"], line_no=1, confirm=True).json()
    assert line(state, 1)["chosen"]["id"] == shop["p250"]
    assert line(state, 1)["conflicts"] == [{"what": "strength", "paper": "500 mg", "system": "250 mg"}]


def test_the_choice_is_kept_against_what_was_proposed(client, storage, ai, shop):
    scan_id = reviewed_scan(client, ai)
    choose(client, scan_id, "supplier", shop["supplier"])
    top = line(api(client, "get", f"{BASE}/{scan_id}/matches").json(), 1)["proposals"][0]["id"]
    other = shop["p500b"] if top == shop["p500"] else shop["p500"]
    choose(client, scan_id, "line", other, line_no=1)
    with db.get_transaction() as cur:
        cur.execute("SELECT shown_value, person_value, action FROM public.invoice_scan_corrections"
                    " WHERE scan_id = %s AND field_path = 'lines.1.medicine_id'", (scan_id,))
        row = cur.fetchone()
    assert (row["shown_value"], row["person_value"], row["action"]) == (top, other, "changed")


# --- 🔴 memory (Chat A) -------------------------------------------------------------------

def test_a_wrong_memory_corrected_is_what_the_next_invoice_proposes(client, storage, ai, shop):
    first = reviewed_scan(client, ai)
    choose(client, first, "supplier", shop["supplier"])
    choose(client, first, "line", shop["p500b"], line_no=1)        # the wrong one
    choose(client, first, "line", shop["p500"], line_no=1)         # corrected
    second = reviewed_scan(client, ai)
    state = api(client, "get", f"{BASE}/{second}/matches").json()
    assert state["supplier"]["proposals"][0]["from_memory"] is True
    choose(client, second, "supplier", shop["supplier"])
    top = line(api(client, "get", f"{BASE}/{second}/matches").json(), 1)["proposals"][0]
    assert (top["id"], top["from_memory"]) == (shop["p500"], True)
    assert top["reasons"][0].startswith("เคยเลือกตัวนี้เมื่อ ") and top["reasons"][0].endswith("จากใบ FAKE-0001")


def test_a_name_that_differs_only_in_spacing_and_case_finds_the_memory(client, storage, ai, shop):
    first = reviewed_scan(client, ai)
    choose(client, first, "supplier", shop["supplier"])
    choose(client, first, "line", shop["p500b"], line_no=1)
    second = reviewed_scan(client, ai, lambda a: a["lines"][0].update(name=read("พาราเซตามอล500มก.  10X10")))
    choose(client, second, "supplier", shop["supplier"])
    top = line(api(client, "get", f"{BASE}/{second}/matches").json(), 1)["proposals"][0]
    assert (top["id"], top["from_memory"]) == (shop["p500b"], True)


def test_memory_is_append_only_in_the_database(client, storage, ai, shop):
    scan_id = reviewed_scan(client, ai)
    choose(client, scan_id, "supplier", shop["supplier"])
    choose(client, scan_id, "line", shop["p500"], line_no=1)
    for table in ("supplier_name_aliases", "medicine_name_aliases"):
        with pytest.raises(psycopg.errors.CheckViolation):
            _write(f"UPDATE public.{table} SET chosen_at = now()", ())
        with pytest.raises(psycopg.errors.CheckViolation):
            _write(f"DELETE FROM public.{table}", ())


def test_a_scan_with_memory_can_still_be_deleted(client, storage, ai, shop):
    scan_id = reviewed_scan(client, ai)
    choose(client, scan_id, "supplier", shop["supplier"])
    choose(client, scan_id, "line", shop["p500"], line_no=1)
    assert api(client, "delete", f"{BASE}/{scan_id}").status_code == 200
    with db.get_transaction() as cur:
        cur.execute("SELECT count(*) AS n FROM public.medicine_name_aliases WHERE invoice_no = 'FAKE-0001'")
        assert cur.fetchone()["n"] == 1   # the memory stays; it carries its own invoice number


def test_every_line_chosen_makes_the_scan_ready(client, storage, ai, shop):
    scan_id = reviewed_scan(client, ai)
    state = choose(client, scan_id, "supplier", shop["supplier"]).json()
    assert state["ready"] is False
    for entry in state["lines"]:
        state = choose(client, scan_id, "line", shop["p500"], line_no=entry["line_no"], confirm=True).json()
    assert state["ready"] is True
