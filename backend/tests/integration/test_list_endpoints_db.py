"""Every list endpoint must answer with real rows in the table.

This file exists because of a bug that 387 passing tests did not see. D28/D29
added `purchase_no` and `invoice_no` to PurchaseSummaryOut, but the SELECT
behind `GET /api/v1/purchases` was never updated, so FastAPI refused to
serialise any row and the endpoint failed for every request that returned
data. Two screens — the receiving work list and the receiving history — were
unusable, while the whole suite stayed green.

The unit tests could not have caught it. They drive a MatchCursor that returns
rows written by hand in the test, so the row always has whatever keys the test
author typed; it is never what the real SQL selects. The three tests that do
call this endpoint all assert 400s on bad query strings, which never reach the
response model at all.

So the missing coverage is exactly this: call each list endpoint against the
real database, with at least one row in range, and require a 200 whose shape
matches the declared response model. An endpoint that returns an empty page
proves nothing here, so each case below seeds its own data first.
"""

from datetime import timedelta

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.schemas.purchase import PurchaseSummaryOut
from app.schemas.sale import SaleSummaryOut
from tests.integration.conftest import (
    api,
    insert_lot,
    insert_medicine,
    insert_supplier,
)

pytestmark = pytest.mark.db


def _confirmed_purchase(client, supplier_id, medicine_id, today):
    """A receipt that has left draft, so it carries purchase_no and invoice_no."""
    created = api(
        client,
        "post",
        "/api/v1/purchases",
        "owner",
        json={
            "supplier_id": str(supplier_id),
            "purchase_date": str(today),
            "invoice_no": "LIST-INV-1",
            "items": [
                {
                    "medicine_id": str(medicine_id),
                    "quantity_invoiced": 10,
                    "quantity_actual": 10,
                    "unit_cost": "12.00",
                    "lot_number": "LIST-L1",
                    "expiry_date": str(today + timedelta(days=200)),
                }
            ],
        },
    )
    assert created.status_code == 201, created.text
    purchase_id = created.json()["id"]
    confirmed = api(client, "post", f"/api/v1/purchases/{purchase_id}/confirm", "owner")
    assert confirmed.status_code == 200, confirmed.text
    return purchase_id


def test_purchases_list_returns_rows(client, today):
    """The regression this file was written for."""
    supplier_id = insert_supplier("List Supplier")
    medicine_id = insert_medicine("List Med")
    _confirmed_purchase(client, supplier_id, medicine_id, today)

    response = api(client, "get", "/api/v1/purchases", "owner")
    assert response.status_code == 200, response.text

    page = response.json()
    assert page["total"] >= 1
    assert page["items"], "a confirmed purchase exists, so the page must not be empty"

    row = page["items"][0]
    # Every field the response model declares has to be there, not merely the
    # ones the SQL happened to select.
    for field in PurchaseSummaryOut.model_fields:
        assert field in row, f"GET /api/v1/purchases dropped {field!r}"
    assert row["purchase_no"], "a confirmed receipt must carry its number (D29)"
    assert row["invoice_no"] == "LIST-INV-1"


def test_purchases_list_includes_drafts_without_a_number(client, today):
    """A draft has no purchase_no yet (D29). Null is fine; a missing key is not."""
    supplier_id = insert_supplier("Draft Supplier")
    medicine_id = insert_medicine("Draft Med")
    created = api(
        client,
        "post",
        "/api/v1/purchases",
        "owner",
        json={
            "supplier_id": str(supplier_id),
            "purchase_date": str(today),
            "items": [
                {
                    "medicine_id": str(medicine_id),
                    "quantity_invoiced": 3,
                    "quantity_actual": 3,
                    "unit_cost": "5.00",
                    "lot_number": "DRAFT-L1",
                    "expiry_date": str(today + timedelta(days=90)),
                }
            ],
        },
    )
    assert created.status_code == 201, created.text

    response = api(client, "get", "/api/v1/purchases?status=draft", "owner")
    assert response.status_code == 200, response.text
    rows = response.json()["items"]
    assert rows, "the draft just created must appear"
    assert "purchase_no" in rows[0] and rows[0]["purchase_no"] is None
    assert "invoice_no" in rows[0]


def test_sales_list_returns_rows(client, today):
    medicine_id = insert_medicine("Sale Med", selling_price="20.00")
    insert_lot(medicine_id, lot_number="SALE-L1", quantity=5, exp_offset_days=120)
    sold = api(
        client,
        "post",
        "/api/v1/sales",
        "owner",
        json={"items": [{"medicine_id": str(medicine_id), "quantity": 1}]},
    )
    assert sold.status_code == 201, sold.text

    response = api(client, "get", "/api/v1/sales", "owner")
    assert response.status_code == 200, response.text
    rows = response.json()["items"]
    assert rows, "the sale just made must appear"
    for field in SaleSummaryOut.model_fields:
        assert field in rows[0], f"GET /api/v1/sales dropped {field!r}"


@pytest.mark.parametrize(
    "path",
    [
        "/api/v1/medicines",
        "/api/v1/suppliers",
        "/api/v1/audit-logs",
        "/api/v1/reports/stock",
        "/api/v1/reports/expiring",
        "/api/v1/reports/expired",
        "/api/v1/reports/low-stock",
        "/api/v1/reports/inventory-value",
        "/api/v1/reports/sales-timeseries",
    ],
)
def test_every_other_list_endpoint_answers_with_data_present(client, today, path):
    """The same class of mismatch, swept across the rest of the API.

    Data is seeded first so each endpoint has something to serialise — an empty
    page would pass without ever building a row.
    """
    supplier_id = insert_supplier("Sweep Supplier")
    medicine_id = insert_medicine("Sweep Med", reorder_point=99)
    insert_lot(medicine_id, lot_number="SWEEP-OK", quantity=4, exp_offset_days=45)
    insert_lot(medicine_id, lot_number="SWEEP-GONE", quantity=2, exp_offset_days=-5)
    _confirmed_purchase(client, supplier_id, medicine_id, today)

    response = api(client, "get", path, "owner")
    assert response.status_code == 200, f"{path} -> {response.status_code} {response.text}"
