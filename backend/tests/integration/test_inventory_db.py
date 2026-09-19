"""Receiving, adjustments, integrity and audit on the real test database
(spec 11 #4, #5, #9, #10, #11, #12)."""

from datetime import timedelta

import pytest

from app import db
from tests.integration.conftest import (
    api,
    count_rows,
    insert_lot,
    insert_medicine,
    insert_supplier,
    table_counts,
)

pytestmark = pytest.mark.db


def purchase_body(supplier_id, medicine_id, today, *, invoiced=20, actual=18, cost="12.50", lot="INT-L1", exp_days=60):
    return {
        "supplier_id": str(supplier_id),
        "purchase_date": str(today),
        "invoice_no": "INV-INT-001",  # D28: confirm refuses without it
        "items": [
            {
                "medicine_id": str(medicine_id),
                "quantity_invoiced": invoiced,
                "quantity_actual": actual,
                "unit_cost": cost,
                "lot_number": lot,
                "expiry_date": str(today + timedelta(days=exp_days)),
            }
        ],
    }


# --- spec 11 #4: duplicate barcode ---------------------------------------------------------------


def test_create_medicine_and_duplicate_barcode_returns_409(client):
    first = api(client, "post", "/api/v1/medicines", "owner",
                json={"name": "Barcode med", "barcode": "INT-8850000000001", "selling_price": "10.00"})
    assert first.status_code == 201, first.text

    duplicate = api(client, "post", "/api/v1/medicines", "pharmacist",
                    json={"name": "Barcode med copy", "barcode": "INT-8850000000001"})
    assert duplicate.status_code == 409
    assert duplicate.json()["error"]["code"] == "DUPLICATE"
    assert count_rows("medicines") == 1


# --- spec 11 #5: receiving -----------------------------------------------------------------------


def test_confirm_creates_lot_and_transaction_then_second_confirm_returns_409(client, today):
    medicine_id = insert_medicine("Receiving med")
    supplier_id = insert_supplier()
    created = api(client, "post", "/api/v1/purchases", "owner",
                  json=purchase_body(supplier_id, medicine_id, today))
    assert created.status_code == 201, created.text
    purchase_id = created.json()["id"]

    confirmed = api(client, "post", f"/api/v1/purchases/{purchase_id}/confirm", "owner")
    assert confirmed.status_code == 200, confirmed.text
    body = confirmed.json()
    assert body["status"] == "discrepancy"  # actual 18 != invoiced 20
    assert body["discrepancies"] == [{"medicine_id": str(medicine_id), "lot_number": "INT-L1", "invoiced": 20, "actual": 18}]
    assert [lot["quantity"] for lot in body["lots"]] == [18]

    with db.get_transaction() as cur:
        cur.execute("SELECT quantity_received, quantity_remaining, cost_per_unit, status FROM public.medicine_lots")
        lot = cur.fetchone()
        cur.execute("SELECT transaction_type, quantity_before, quantity_change, quantity_after FROM public.inventory_transactions")
        tx = cur.fetchone()
    assert (lot["quantity_received"], lot["quantity_remaining"], lot["status"]) == (18, 18, "active")
    assert (tx["transaction_type"], tx["quantity_before"], tx["quantity_change"], tx["quantity_after"]) == ("purchase", 0, 18, 18)

    again = api(client, "post", f"/api/v1/purchases/{purchase_id}/confirm", "owner")
    assert again.status_code == 409
    assert count_rows("medicine_lots") == 1


def test_confirm_without_discrepancy_sets_confirmed(client, today):
    medicine_id = insert_medicine("Receiving exact med")
    supplier_id = insert_supplier("Exact supplier")
    created = api(client, "post", "/api/v1/purchases", "owner",
                  json=purchase_body(supplier_id, medicine_id, today, invoiced=5, actual=None, lot="INT-EXACT"))
    confirmed = api(client, "post", f"/api/v1/purchases/{created.json()['id']}/confirm", "owner")
    assert confirmed.status_code == 200
    assert confirmed.json()["status"] == "confirmed" and confirmed.json()["discrepancies"] == []


# --- spec 11 #9: insufficient stock rolls everything back -------------------------------------------


def test_insufficient_stock_writes_no_rows(client):
    medicine_id = insert_medicine("Short stock med")
    insert_lot(medicine_id, lot_number="SHORT-1", quantity=2, exp_offset_days=30)
    before = table_counts()

    resp = api(client, "post", "/api/v1/sales", "owner",
               json={"items": [{"medicine_id": str(medicine_id), "quantity": 5}]})
    assert resp.status_code == 409
    assert resp.json()["error"]["details"] == [{"medicine_id": str(medicine_id), "requested": 5, "available": 2}]
    assert table_counts() == before

    with db.get_transaction() as cur:
        cur.execute("SELECT quantity_remaining FROM public.medicine_lots WHERE lot_number = 'SHORT-1'")
        assert cur.fetchone()["quantity_remaining"] == 2


def test_multi_medicine_sale_with_one_short_rolls_back(client):
    plenty = insert_medicine("Plenty med")
    scarce = insert_medicine("Scarce med")
    insert_lot(plenty, lot_number="PLENTY-1", quantity=50, exp_offset_days=40)
    insert_lot(scarce, lot_number="SCARCE-1", quantity=1, exp_offset_days=40)
    before = table_counts()

    resp = api(client, "post", "/api/v1/sales", "owner", json={"items": [
        {"medicine_id": str(plenty), "quantity": 5},
        {"medicine_id": str(scarce), "quantity": 3},
    ]})
    assert resp.status_code == 409
    assert [d["medicine_id"] for d in resp.json()["error"]["details"]] == [str(scarce)]
    assert table_counts() == before


# --- spec 11 #10: data integrity ---------------------------------------------------------------------


def test_lot_quantities_match_transaction_history(client):
    medicine_id = insert_medicine("Integrity med", selling_price="20.00")
    lot = insert_lot(medicine_id, lot_number="INTEG-1", quantity=10, exp_offset_days=45)

    assert api(client, "post", "/api/v1/sales", "owner", json={"items": [{"medicine_id": str(medicine_id), "quantity": 4}]}).status_code == 201
    assert api(client, "post", f"/api/v1/lots/{lot['id']}/adjustments", "owner",
               json={"transaction_type": "damage", "quantity_change": -2, "reason": "แตกระหว่างจัดเรียง"}).status_code == 201

    with db.get_transaction() as cur:
        cur.execute(
            """
            SELECT l.quantity_received, l.quantity_remaining,
                   COALESCE(SUM(t.quantity_change) FILTER (WHERE t.transaction_type <> 'purchase'), 0) AS non_purchase,
                   bool_and(t.quantity_before + t.quantity_change = t.quantity_after) AS consistent,
                   count(t.id) AS tx_rows
            FROM public.medicine_lots l
            LEFT JOIN public.inventory_transactions t ON t.medicine_lot_id = l.id
            WHERE l.id = %s
            GROUP BY l.id, l.quantity_received, l.quantity_remaining
            """,
            (lot["id"],),
        )
        row = cur.fetchone()

    assert row["quantity_remaining"] == 4
    assert row["quantity_received"] + row["non_purchase"] == row["quantity_remaining"]
    assert row["consistent"] is True and row["tx_rows"] == 2


# --- spec 11 #11: adjustment rules ---------------------------------------------------------------------


def test_adjustment_without_reason_or_below_zero_returns_400(client):
    medicine_id = insert_medicine("Adjust med")
    lot = insert_lot(medicine_id, lot_number="ADJ-1", quantity=3, exp_offset_days=30)
    before = table_counts()

    missing_reason = api(client, "post", f"/api/v1/lots/{lot['id']}/adjustments", "owner",
                         json={"transaction_type": "damage", "quantity_change": -1})
    assert missing_reason.status_code == 400

    too_many = api(client, "post", f"/api/v1/lots/{lot['id']}/adjustments", "owner",
                   json={"transaction_type": "damage", "quantity_change": -10, "reason": "เกินจำนวน"})
    assert too_many.status_code == 400
    assert too_many.json()["error"]["message"] == "จำนวนคงเหลือไม่พอสำหรับการปรับ"
    assert table_counts() == before


def test_adjustment_status_transitions(client):
    medicine_id = insert_medicine("Status med")
    lot = insert_lot(medicine_id, lot_number="ST-1", quantity=1, exp_offset_days=30)

    depleted = api(client, "post", f"/api/v1/lots/{lot['id']}/adjustments", "owner",
                   json={"transaction_type": "adjustment", "quantity_change": -1, "reason": "นับสต็อก"})
    assert depleted.status_code == 201 and depleted.json()["status"] == "depleted"

    back = api(client, "post", f"/api/v1/lots/{lot['id']}/adjustments", "owner",
               json={"transaction_type": "correction", "quantity_change": 2, "reason": "พบของเพิ่ม"})
    assert back.status_code == 201 and back.json()["status"] == "active" and back.json()["quantity_remaining"] == 2

    damaged = api(client, "post", f"/api/v1/lots/{lot['id']}/adjustments", "owner",
                  json={"transaction_type": "damage", "quantity_change": -2, "reason": "เสียหาย"})
    assert damaged.status_code == 201 and damaged.json()["status"] == "damaged"

    blocked = api(client, "post", f"/api/v1/lots/{lot['id']}/adjustments", "owner",
                  json={"transaction_type": "correction", "quantity_change": 1, "reason": "ขอเพิ่ม"})
    assert blocked.status_code == 409


# --- spec 11 #12: audit for every critical action ---------------------------------------------------------


def test_every_critical_action_writes_audit(client, today):
    medicine = api(client, "post", "/api/v1/medicines", "owner",
                   json={"name": "Audit med", "selling_price": "30.00"})
    medicine_id = medicine.json()["id"]
    assert api(client, "patch", f"/api/v1/medicines/{medicine_id}", "owner", json={"selling_price": "31.00"}).status_code == 200

    supplier = api(client, "post", "/api/v1/suppliers", "owner", json={"name": "Audit supplier"})
    supplier_id = supplier.json()["id"]
    assert api(client, "patch", f"/api/v1/suppliers/{supplier_id}", "owner", json={"phone": "021112222"}).status_code == 200

    purchase = api(client, "post", "/api/v1/purchases", "owner",
                   json=purchase_body(supplier_id, medicine_id, today, invoiced=10, actual=None, lot="AUD-1"))
    purchase_id = purchase.json()["id"]
    assert api(client, "post", f"/api/v1/purchases/{purchase_id}/confirm", "owner").status_code == 200

    sale = api(client, "post", "/api/v1/sales", "owner", json={"items": [{"medicine_id": str(medicine_id), "quantity": 1}]})
    assert sale.status_code == 201

    with db.get_transaction() as cur:
        cur.execute("SELECT id FROM public.medicine_lots LIMIT 1")
        lot_id = cur.fetchone()["id"]
    assert api(client, "post", f"/api/v1/lots/{lot_id}/adjustments", "owner",
               json={"transaction_type": "damage", "quantity_change": -1, "reason": "ตรวจสอบ"}).status_code == 201

    logs = api(client, "get", "/api/v1/audit-logs?limit=200", "owner").json()["items"]
    by_table = {}
    for entry in logs:
        by_table.setdefault(entry["table_name"], []).append(entry["action"])

    assert sorted(by_table["medicines"]) == ["insert", "update"]
    assert sorted(by_table["suppliers"]) == ["insert", "update"]
    assert sorted(by_table["purchases"]) == ["insert", "update"]  # create + confirm
    assert by_table["sales"] == ["insert"]
    assert by_table["medicine_lots"] == ["update"]  # adjustment
    assert all(entry["changed_by_name"] for entry in logs)


def test_deleting_draft_purchase_is_audited(client, today):
    medicine_id = insert_medicine("Delete audit med")
    supplier_id = insert_supplier("Delete audit supplier")
    created = api(client, "post", "/api/v1/purchases", "owner",
                  json=purchase_body(supplier_id, medicine_id, today, invoiced=3, actual=None, lot="DEL-1"))
    purchase_id = created.json()["id"]
    assert api(client, "delete", f"/api/v1/purchases/{purchase_id}", "owner").status_code == 200
    assert api(client, "get", f"/api/v1/purchases/{purchase_id}", "owner").status_code == 404

    logs = api(client, "get", f"/api/v1/audit-logs?table_name=purchases&record_id={purchase_id}", "owner").json()["items"]
    assert sorted(entry["action"] for entry in logs) == ["delete", "insert"]
    assert count_rows("purchase_items") == 0


# --- D23: a sale from another window must not be overwritten ---------------------------------------


def test_sale_during_an_open_adjust_dialog_returns_409(client):
    """The real case from the spec: the dialog reads 5, someone sells 2, the save must not
    write 4 over a lot that actually holds 3."""
    medicine_id = insert_medicine("D23 med", selling_price="20.00")
    lot = insert_lot(medicine_id, lot_number="D23-1", quantity=5, exp_offset_days=60)

    # what the dialog read when it opened
    opened = api(client, "get", f"/api/v1/lots/{lot['id']}", "owner")
    assert opened.status_code == 200
    seen = opened.json()["quantity_remaining"]
    assert seen == 5

    # another window sells 2 from the same lot
    sale = api(client, "post", "/api/v1/sales", "staff",
               json={"items": [{"medicine_id": str(medicine_id), "quantity": 2}]})
    assert sale.status_code == 201, sale.text

    counts = table_counts()
    stale = api(client, "post", f"/api/v1/lots/{lot['id']}/adjustments", "owner",
                json={"transaction_type": "correction", "quantity_change": -1,
                      "quantity_before": seen, "reason": "นับสต็อกแล้วไม่ตรง"})
    assert stale.status_code == 409
    assert stale.json()["error"]["code"] == "INVALID_STATE"
    assert stale.json()["error"]["message"] == "จำนวนคงเหลือเปลี่ยนไป กรุณาตรวจนับใหม่"
    assert table_counts() == counts  # nothing written

    # after re-counting against the fresh number the same adjustment succeeds
    fresh = api(client, "get", f"/api/v1/lots/{lot['id']}", "owner").json()["quantity_remaining"]
    assert fresh == 3
    retry = api(client, "post", f"/api/v1/lots/{lot['id']}/adjustments", "owner",
                json={"transaction_type": "correction", "quantity_change": -1,
                      "quantity_before": fresh, "reason": "นับสต็อกแล้วไม่ตรง"})
    assert retry.status_code == 201, retry.text
    assert retry.json()["quantity_remaining"] == 2
