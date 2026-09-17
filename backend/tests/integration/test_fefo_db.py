"""FEFO selling, expired lots and concurrency on the real test database
(spec 11 #6, #7, #8, #13; D9, D10)."""

import threading

import pytest
from fastapi.testclient import TestClient

from app import db
from app.main import app
from tests.integration.conftest import api, count_rows, headers, insert_lot, insert_medicine, table_counts

pytestmark = pytest.mark.db


def remaining(lot_number: str) -> int:
    with db.get_transaction() as cur:
        cur.execute("SELECT quantity_remaining FROM public.medicine_lots WHERE lot_number = %s", (lot_number,))
        return cur.fetchone()["quantity_remaining"]


def lot_status(lot_number: str) -> str:
    with db.get_transaction() as cur:
        cur.execute("SELECT status FROM public.medicine_lots WHERE lot_number = %s", (lot_number,))
        return cur.fetchone()["status"]


# --- spec 11 #6 and #7: FEFO ---------------------------------------------------------------------


def test_sale_takes_the_nearest_expiry_lot_first(client):
    medicine_id = insert_medicine("FEFO med", selling_price="10.00")
    insert_lot(medicine_id, lot_number="FEFO-FAR", quantity=10, exp_offset_days=300)
    insert_lot(medicine_id, lot_number="FEFO-NEAR", quantity=10, exp_offset_days=20)
    insert_lot(medicine_id, lot_number="FEFO-MID", quantity=10, exp_offset_days=100)

    resp = api(client, "post", "/api/v1/sales", "owner", json={"items": [{"medicine_id": str(medicine_id), "quantity": 4}]})
    assert resp.status_code == 201, resp.text
    assert [(i["lot_number"], i["quantity"]) for i in resp.json()["items"]] == [("FEFO-NEAR", 4)]
    assert remaining("FEFO-NEAR") == 6 and remaining("FEFO-MID") == 10 and remaining("FEFO-FAR") == 10


def test_sale_spans_lots_and_depletes_the_first(client):
    medicine_id = insert_medicine("FEFO span med", selling_price="10.00")
    insert_lot(medicine_id, lot_number="SPAN-1", quantity=6, exp_offset_days=15)
    insert_lot(medicine_id, lot_number="SPAN-2", quantity=6, exp_offset_days=120)

    resp = api(client, "post", "/api/v1/sales", "owner", json={"items": [{"medicine_id": str(medicine_id), "quantity": 9}]})
    assert resp.status_code == 201, resp.text
    assert [(i["lot_number"], i["quantity"]) for i in resp.json()["items"]] == [("SPAN-1", 6), ("SPAN-2", 3)]
    assert count_rows("sale_items") == 2
    assert remaining("SPAN-1") == 0 and lot_status("SPAN-1") == "depleted"
    assert remaining("SPAN-2") == 3 and lot_status("SPAN-2") == "active"

    with db.get_transaction() as cur:
        cur.execute(
            "SELECT quantity_before, quantity_change, quantity_after FROM public.inventory_transactions"
            " WHERE transaction_type = 'sale' ORDER BY quantity_change"
        )
        rows = cur.fetchall()
    assert [(r["quantity_before"], r["quantity_change"], r["quantity_after"]) for r in rows] == [(6, -6, 0), (6, -3, 3)]


def test_same_expiry_prefers_older_received_date(client):
    medicine_id = insert_medicine("FEFO tie med", selling_price="10.00")
    insert_lot(medicine_id, lot_number="TIE-NEW", quantity=5, exp_offset_days=40, received_offset_days=-1)
    insert_lot(medicine_id, lot_number="TIE-OLD", quantity=5, exp_offset_days=40, received_offset_days=-30)

    resp = api(client, "post", "/api/v1/sales", "owner", json={"items": [{"medicine_id": str(medicine_id), "quantity": 2}]})
    assert resp.status_code == 201
    assert resp.json()["items"][0]["lot_number"] == "TIE-OLD"


# --- spec 11 #8: expired lots (D10) -----------------------------------------------------------------


@pytest.mark.parametrize("exp_offset,label", [(-1, "yesterday"), (0, "today")])
def test_expired_lot_cannot_be_sold_and_shows_in_expired_report(client, exp_offset, label):
    medicine_id = insert_medicine(f"Expired med {label}", selling_price="10.00")
    lot = insert_lot(medicine_id, lot_number=f"EXP-{label}", quantity=5, exp_offset_days=exp_offset)
    before = table_counts()

    sale = api(client, "post", "/api/v1/sales", "owner", json={"items": [{"medicine_id": str(medicine_id), "quantity": 1}]})
    assert sale.status_code == 409, sale.text
    assert sale.json()["error"]["details"] == [{"medicine_id": str(medicine_id), "requested": 1, "available": 0}]
    assert table_counts() == before

    preview = api(client, "get", f"/api/v1/medicines/{medicine_id}/fefo-preview?quantity=1", "owner").json()
    assert preview["available"] == 0 and preview["allocations"] == [] and preview["sufficient"] is False

    medicine = api(client, "get", f"/api/v1/medicines/{medicine_id}", "owner").json()
    assert medicine["available_quantity"] == 0

    expired = api(client, "get", "/api/v1/reports/expired", "owner").json()
    assert [row["lot_id"] for row in expired["items"]] == [str(lot["id"])]
    assert expired["items"][0]["days_expired"] == -exp_offset

    expiring = api(client, "get", "/api/v1/reports/expiring?days=3650", "owner").json()
    assert str(lot["id"]) not in [row["lot_id"] for row in expiring["items"]]

    add = api(client, "post", f"/api/v1/lots/{lot['id']}/adjustments", "owner",
              json={"transaction_type": "correction", "quantity_change": 1, "reason": "ขอเพิ่ม"})
    assert add.status_code == 400
    assert add.json()["error"]["message"] == "ไม่สามารถเพิ่มจำนวนให้ Lot ที่หมดอายุแล้ว"

    write_off = api(client, "post", f"/api/v1/lots/{lot['id']}/adjustments", "owner",
                    json={"transaction_type": "expired", "quantity_change": -5, "reason": "ตัดยาหมดอายุ"})
    assert write_off.status_code == 201, write_off.text
    assert write_off.json()["status"] == "expired" and write_off.json()["quantity_remaining"] == 0
    assert api(client, "get", "/api/v1/reports/expired", "owner").json()["items"] == []


def test_lot_expiring_tomorrow_is_still_sellable(client):
    medicine_id = insert_medicine("Expiring tomorrow med", selling_price="10.00")
    insert_lot(medicine_id, lot_number="EXP-TOMORROW", quantity=5, exp_offset_days=1)

    resp = api(client, "post", "/api/v1/sales", "owner", json={"items": [{"medicine_id": str(medicine_id), "quantity": 2}]})
    assert resp.status_code == 201, resp.text
    assert remaining("EXP-TOMORROW") == 3

    expiring = api(client, "get", "/api/v1/reports/expiring?days=30", "owner").json()
    assert expiring["items"][0]["risk_level"] == "critical" and expiring["items"][0]["days_remaining"] == 1


# --- spec 11 #13: concurrent sales --------------------------------------------------------------------


def test_ten_concurrent_sales_on_stock_of_three(client):
    medicine_id = insert_medicine("Concurrency med", selling_price="10.00")
    insert_lot(medicine_id, lot_number="CONC-1", quantity=3, exp_offset_days=60)

    barrier = threading.Barrier(10)
    results = []
    auth_header = headers("owner")
    payload = {"items": [{"medicine_id": str(medicine_id), "quantity": 1}]}

    def worker():
        local = TestClient(app)
        barrier.wait()
        results.append(local.post("/api/v1/sales", json=payload, headers=auth_header).status_code)

    threads = [threading.Thread(target=worker) for _ in range(10)]
    for thread in threads:
        thread.start()
    for thread in threads:
        thread.join()

    assert sorted(results) == [201, 201, 201] + [409] * 7, results
    assert remaining("CONC-1") == 0 and lot_status("CONC-1") == "depleted"
    assert count_rows("sales") == 3 and count_rows("sale_items") == 3
    assert count_rows("inventory_transactions", "WHERE transaction_type = 'sale'") == 3

    with db.get_transaction() as cur:
        cur.execute(
            "SELECT bool_and(quantity_before + quantity_change = quantity_after) AS ok,"
            " min(quantity_after) AS lowest FROM public.inventory_transactions"
        )
        row = cur.fetchone()
    assert row["ok"] is True and row["lowest"] >= 0
