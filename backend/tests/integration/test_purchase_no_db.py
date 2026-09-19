"""D28 / D29 / D30 on the real test database: the delivery-note number, the
receipt number that is only issued on leaving draft, and who received when."""

import threading
from datetime import timedelta

import pytest
from fastapi.testclient import TestClient

from app import db
from app.main import app
from tests.integration.conftest import (
    api,
    headers,
    insert_medicine,
    insert_supplier,
    table_counts,
)

pytestmark = pytest.mark.db


def draft_body(supplier_id, medicine_id, today, *, invoice_no="INV-D29", lot="D29-L1"):
    body = {
        "supplier_id": str(supplier_id),
        "purchase_date": str(today),
        "items": [
            {
                "medicine_id": str(medicine_id),
                "quantity_invoiced": 5,
                "quantity_actual": 5,
                "unit_cost": "10.00",
                "lot_number": lot,
                "expiry_date": str(today + timedelta(days=120)),
            }
        ],
    }
    if invoice_no is not None:
        body["invoice_no"] = invoice_no
    return body


def test_draft_keeps_a_null_purchase_no(client, today):
    """D29 #2: creating a draft must not burn a number."""
    supplier_id = insert_supplier("D29 supplier")
    medicine_id = insert_medicine("D29 med")

    resp = api(client, "post", "/api/v1/purchases", "owner",
               json=draft_body(supplier_id, medicine_id, today))
    assert resp.status_code == 201, resp.text
    assert resp.json()["purchase_no"] is None
    assert resp.json()["confirmed_at"] is None

    with db.get_transaction() as cur:
        cur.execute(
            "SELECT purchase_no, confirmed_at, status FROM public.purchases WHERE id = %s",
            (resp.json()["id"],),
        )
        row = cur.fetchone()
    assert row["purchase_no"] is None
    assert row["confirmed_at"] is None
    assert row["status"] == "draft"


def test_check_constraint_blocks_leaving_draft_without_a_number(client, today):
    """D29 #3: the database itself refuses a non-draft row with no number."""
    supplier_id = insert_supplier("D29 check supplier")
    medicine_id = insert_medicine("D29 check med")
    created = api(client, "post", "/api/v1/purchases", "owner",
                  json=draft_body(supplier_id, medicine_id, today, lot="D29-CHK"))
    purchase_id = created.json()["id"]

    with pytest.raises(Exception) as error:
        with db.get_transaction() as cur:
            cur.execute(
                "UPDATE public.purchases SET status = 'confirmed' WHERE id = %s", (purchase_id,)
            )
    assert "purchases_purchase_no_required" in str(error.value)

    with db.get_transaction() as cur:
        cur.execute("SELECT status FROM public.purchases WHERE id = %s", (purchase_id,))
        assert cur.fetchone()["status"] == "draft"


def test_confirm_without_invoice_no_returns_422(client, today):
    """D28: a draft saves without it; nothing is received without it."""
    supplier_id = insert_supplier("D28 supplier")
    medicine_id = insert_medicine("D28 med")
    created = api(client, "post", "/api/v1/purchases", "owner",
                  json=draft_body(supplier_id, medicine_id, today, invoice_no=None, lot="D28-L1"))
    assert created.status_code == 201, created.text
    assert created.json()["invoice_no"] is None

    before = table_counts()
    resp = api(client, "post", f"/api/v1/purchases/{created.json()['id']}/confirm", "owner")
    assert resp.status_code == 422
    assert resp.json()["error"]["code"] == "VALIDATION_ERROR"
    assert table_counts() == before  # no lots created, nothing received


def test_discarding_a_draft_leaves_no_gap_in_the_numbers(client, today):
    """D29 #4: numbers come from confirms, so a thrown-away draft skips nothing."""
    supplier_id = insert_supplier("D29 gap supplier")
    medicine_id = insert_medicine("D29 gap med")

    first = api(client, "post", "/api/v1/purchases", "owner",
                json=draft_body(supplier_id, medicine_id, today, lot="GAP-1"))
    first_confirm = api(client, "post", f"/api/v1/purchases/{first.json()['id']}/confirm", "owner")
    assert first_confirm.status_code == 200, first_confirm.text

    thrown_away = api(client, "post", "/api/v1/purchases", "owner",
                      json=draft_body(supplier_id, medicine_id, today, lot="GAP-2"))
    discarded = api(client, "delete", f"/api/v1/purchases/{thrown_away.json()['id']}", "owner")
    assert discarded.status_code == 200, discarded.text

    third = api(client, "post", "/api/v1/purchases", "owner",
                json=draft_body(supplier_id, medicine_id, today, lot="GAP-3"))
    third_confirm = api(client, "post", f"/api/v1/purchases/{third.json()['id']}/confirm", "owner")
    assert third_confirm.status_code == 200, third_confirm.text

    numbers = [first_confirm.json()["purchase_no"], third_confirm.json()["purchase_no"]]
    runnings = [int(number.rsplit("-", 1)[1]) for number in numbers]
    assert runnings == [1, 2], numbers  # no gap where the discarded draft was


def test_concurrent_confirms_never_share_a_purchase_no(client, today):
    """D29 #1: several receipts confirmed at once still get distinct numbers."""
    supplier_id = insert_supplier("D29 race supplier")
    medicine_id = insert_medicine("D29 race med")

    workers = 6
    purchase_ids = []
    for index in range(workers):
        created = api(client, "post", "/api/v1/purchases", "owner",
                      json=draft_body(supplier_id, medicine_id, today, lot=f"RACE-{index}"))
        assert created.status_code == 201, created.text
        purchase_ids.append(created.json()["id"])

    barrier = threading.Barrier(workers)
    auth_header = headers("owner")
    results: list[tuple[int, str | None]] = []
    lock = threading.Lock()

    def worker(purchase_id):
        local = TestClient(app)
        barrier.wait()
        resp = local.post(f"/api/v1/purchases/{purchase_id}/confirm", headers=auth_header)
        body = resp.json() if resp.status_code == 200 else {}
        with lock:
            results.append((resp.status_code, body.get("purchase_no")))

    threads = [threading.Thread(target=worker, args=(pid,)) for pid in purchase_ids]
    for thread in threads:
        thread.start()
    for thread in threads:
        thread.join()

    assert [status for status, _ in results] == [200] * workers, results
    numbers = [number for _, number in results]
    assert all(numbers), "every confirmed receipt must carry a number"
    assert len(set(numbers)) == workers, numbers

    with db.get_transaction() as cur:
        cur.execute(
            "SELECT purchase_no FROM public.purchases"
            " WHERE purchase_no IS NOT NULL ORDER BY purchase_no"
        )
        stored = [row["purchase_no"] for row in cur.fetchall()]
    assert sorted(numbers) == stored
    runnings = sorted(int(number.rsplit("-", 1)[1]) for number in stored)
    assert runnings == list(range(1, workers + 1)), runnings


def test_confirmed_at_and_created_by_name(client, today):
    """D30: the note names whoever booked it in, and dates it when it was counted."""
    supplier_id = insert_supplier("D30 supplier")
    medicine_id = insert_medicine("D30 med")

    created = api(client, "post", "/api/v1/purchases", "pharmacist",
                  json=draft_body(supplier_id, medicine_id, today, lot="D30-L1"))
    assert created.status_code == 201, created.text
    receiver = created.json()["created_by_name"]
    assert receiver  # the pharmacist has a profile in the test project

    confirmed = api(client, "post", f"/api/v1/purchases/{created.json()['id']}/confirm",
                    "pharmacist")
    assert confirmed.status_code == 200, confirmed.text
    assert confirmed.json()["confirmed_at"] is not None

    # the owner reading it back still sees the pharmacist as the receiver
    detail = api(client, "get", f"/api/v1/purchases/{created.json()['id']}", "owner").json()
    assert detail["created_by_name"] == receiver
    assert detail["confirmed_at"] is not None
    assert detail["purchase_no"] == confirmed.json()["purchase_no"]
    assert detail["invoice_no"] == "INV-D29"
