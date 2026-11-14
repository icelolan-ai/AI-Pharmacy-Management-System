"""The numbering lock (D79), on the real test database.

The bug it fixes: confirm 6 purchases at once and one could come back 409,
because its "highest number + 1" kept clashing until the retries ran out.
These tests press more tills than there are retries (12 against 5), so they
fail the moment the lock stops doing its job — not merely when unlucky.

Each check also counts attempts: with the lock, every sale and every confirm
succeeds on its first try. Without it, even a run where the retries happen
to absorb every clash shows up as extra attempts.
"""

import threading
from datetime import date, timedelta

import psycopg
import pytest
from fastapi.testclient import TestClient

from app.doc_numbers import NumberedDocument, day_key, lock_running_number
from app.main import app
from app.services import purchases as purchase_service
from app.services import sales as sale_service
from tests.integration.conftest import (
    TEST_CONFIG,
    api,
    count_rows,
    headers,
    insert_lot,
    insert_medicine,
    insert_supplier,
)

pytestmark = pytest.mark.db

WORKERS = 12  # more than MAX_*_NO_ATTEMPTS (5): retries alone cannot save it


def _press_at_once(send):
    """Run `send(index)` from WORKERS threads released together."""
    barrier = threading.Barrier(WORKERS)
    results: list = [None] * WORKERS

    def worker(index):
        local = TestClient(app)
        barrier.wait()
        results[index] = send(local, index)

    threads = [threading.Thread(target=worker, args=(i,)) for i in range(WORKERS)]
    for thread in threads:
        thread.start()
    for thread in threads:
        thread.join()
    return results


def _count_calls(monkeypatch, module, name):
    calls = {"n": 0}
    lock = threading.Lock()
    original = getattr(module, name)

    def counted(*args, **kwargs):
        with lock:
            calls["n"] += 1
        return original(*args, **kwargs)

    monkeypatch.setattr(module, name, counted)
    return calls


def _assert_one_run_of_numbers(numbers):
    assert all(numbers), numbers
    assert len(set(numbers)) == WORKERS, numbers
    assert len({n.rsplit("-", 1)[0] for n in numbers}) == 1, numbers
    assert sorted(int(n.rsplit("-", 1)[1]) for n in numbers) == list(range(1, WORKERS + 1))


def test_twelve_purchases_confirmed_at_once_all_succeed(client, today, monkeypatch):
    supplier_id = insert_supplier("D79 purchase race")
    medicine_id = insert_medicine("D79 purchase race med")
    purchase_ids = []
    for index in range(WORKERS):
        created = api(client, "post", "/api/v1/purchases", "owner", json={
            "supplier_id": str(supplier_id),
            "purchase_date": str(today),
            "invoice_no": f"INV-D79-{index}",
            "items": [{
                "medicine_id": str(medicine_id), "quantity_invoiced": 5, "quantity_actual": 5,
                "unit_cost": "10.00", "lot_number": f"D79-{index}",
                "expiry_date": str(today + timedelta(days=120)),
            }],
        })
        assert created.status_code == 201, created.text
        purchase_ids.append(created.json()["id"])

    attempts = _count_calls(monkeypatch, purchase_service, "_confirm_purchase_once")
    auth = headers("owner")
    results = _press_at_once(
        lambda local, i: local.post(f"/api/v1/purchases/{purchase_ids[i]}/confirm", headers=auth)
    )

    assert [r.status_code for r in results] == [200] * WORKERS, [(r.status_code, r.text[:120]) for r in results]
    _assert_one_run_of_numbers([r.json()["purchase_no"] for r in results])
    assert attempts["n"] == WORKERS, f"{attempts['n']} attempts for {WORKERS} confirms: some had to retry"


def test_twelve_sales_at_once_on_different_medicines_all_succeed(client, monkeypatch):
    """Each till sells a different medicine, so no stock row is shared and
    nothing but the numbering lock makes them take turns. (The older test,
    ten sales of one medicine, was lined up by its stock lock and could not
    see this race.)"""
    medicines = []
    for index in range(WORKERS):
        medicine_id = insert_medicine(f"D79 sale race med {index}", selling_price="10.00")
        insert_lot(medicine_id, lot_number=f"D79-S-{index}", quantity=5, exp_offset_days=90)
        medicines.append(str(medicine_id))

    attempts = _count_calls(monkeypatch, sale_service, "_create_sale_once")
    auth = headers("owner")
    results = _press_at_once(
        lambda local, i: local.post(
            "/api/v1/sales", json={"items": [{"medicine_id": medicines[i], "quantity": 1}]}, headers=auth
        )
    )

    assert [r.status_code for r in results] == [201] * WORKERS, [(r.status_code, r.text[:120]) for r in results]
    _assert_one_run_of_numbers([r.json()["sale_no"] for r in results])
    assert count_rows("sales") == WORKERS
    assert attempts["n"] == WORKERS, f"{attempts['n']} attempts for {WORKERS} sales: some had to retry"


# --- the lock key: (document, day), two kinds can never share one -----------
# Both sides take the lock through the real lock_running_number (D43-a). A
# side that would have to wait is cut off after half a second and reports it.

def _waits(conn, document, day) -> bool:
    try:
        with conn.cursor() as cur:
            cur.execute("SET LOCAL statement_timeout = '500ms'")
            lock_running_number(cur, document, day)
        return False
    except psycopg.errors.QueryCanceled:
        conn.rollback()
        return True


def test_sales_and_purchases_never_wait_for_each_other_on_the_same_day():
    day = date(2026, 11, 15)
    with psycopg.connect(TEST_CONFIG["database_url"]) as holder, psycopg.connect(TEST_CONFIG["database_url"]) as other:
        with holder.cursor() as cur:
            lock_running_number(cur, NumberedDocument.SALE, day)  # held until holder ends
        assert _waits(other, NumberedDocument.PURCHASE, day) is False, "a purchase waited for a sale"
        other.rollback()
        assert _waits(other, NumberedDocument.SALE, day + timedelta(days=1)) is False, "the next day waited"
        other.rollback()
        assert _waits(other, NumberedDocument.SALE, day) is True, "two sales on one day both got the lock"


def test_the_day_half_of_the_key_is_the_calendar_date():
    assert day_key(date(2026, 11, 15)) == 20261115
    assert day_key(date(2027, 1, 2)) == 20270102
    assert NumberedDocument.SALE != NumberedDocument.PURCHASE
