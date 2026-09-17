"""Unit tests for lot views and lot transactions (task 3.9). No real database."""

import uuid
from datetime import date, timedelta
from decimal import Decimal

import pytest
from fastapi.testclient import TestClient

from app import db
from app.auth import get_current_user
from app.main import app
from app.services import lots as lot_service
from tests.helpers import NOW, MatchCursor, assert_error, fake_transaction, make_user

TODAY = date(2026, 9, 17)
MED = uuid.uuid4()
LOT = uuid.uuid4()


def lot_row(**overrides):
    row = {
        "id": LOT, "medicine_id": MED, "medicine_name": "TEST-Med", "lot_number": "L1",
        "supplier_id": uuid.uuid4(), "quantity_received": 18, "quantity_remaining": 3,
        "expiry_date": TODAY + timedelta(days=20), "received_date": TODAY, "status": "active",
        "cost_per_unit": Decimal("12.5"), "days_remaining": 20, "sellable": True,
    }
    row.update(overrides)
    return row


@pytest.fixture
def client():
    yield TestClient(app)
    app.dependency_overrides.clear()


def login_as(role):
    user = make_user(role)
    app.dependency_overrides[get_current_user] = lambda: user
    return user


def use_rules(monkeypatch, rules):
    cursor = MatchCursor(rules)
    monkeypatch.setattr(db, "get_transaction", fake_transaction(cursor))
    return cursor


LIST_RULES = [
    ("FROM public.medicines WHERE id", {"found": 1}),
    ("count(*) AS total", {"total": 1}),
    ("FROM public.medicine_lots l", [lot_row()]),
]


def test_staff_lot_list_has_no_cost_field(client, monkeypatch):
    login_as("staff")
    use_rules(monkeypatch, LIST_RULES)
    resp = client.get(f"/api/v1/medicines/{MED}/lots")
    assert resp.status_code == 200, resp.text
    item = resp.json()["items"][0]
    assert "cost_per_unit" not in item and "cost" not in resp.text
    assert item["days_remaining"] == 20 and item["sellable"] is True


@pytest.mark.parametrize("role", ["owner", "pharmacist"])
def test_manager_lot_list_has_cost_as_string(client, monkeypatch, role):
    login_as(role)
    use_rules(monkeypatch, LIST_RULES)
    item = client.get(f"/api/v1/medicines/{MED}/lots").json()["items"][0]
    assert item["cost_per_unit"] == "12.50"


def test_default_list_hides_depleted_and_inactive_lots(client, monkeypatch):
    login_as("staff")
    cursor = use_rules(monkeypatch, LIST_RULES)
    client.get(f"/api/v1/medicines/{MED}/lots")
    query = cursor.queries("ORDER BY l.expiry_date")[0][0]
    where = query.split(" WHERE ", 1)[1]  # the SELECT's sellable expression uses the same text
    assert "l.status = 'active' AND l.quantity_remaining > 0" in where
    assert "ORDER BY l.expiry_date ASC, l.received_date ASC, l.id ASC" in where


def test_include_inactive_shows_all_lots(client, monkeypatch):
    login_as("staff")
    cursor = use_rules(monkeypatch, LIST_RULES)
    client.get(f"/api/v1/medicines/{MED}/lots?include_inactive=true")
    query = cursor.queries("ORDER BY l.expiry_date")[0][0]
    where = query.split(" WHERE ", 1)[1]
    assert "l.status = 'active'" not in where and "l.quantity_remaining > 0" not in where
    assert where.startswith("l.medicine_id = %s")


def test_lot_sql_computes_days_remaining_and_sellable_from_business_today():
    text = lot_service.lot_select_sql().as_string()
    today = "((now()) AT TIME ZONE 'Asia/Bangkok')::date"
    assert f"(l.expiry_date - {today}) AS days_remaining" in text
    assert "l.status = 'active' AND l.quantity_remaining > 0" in text
    assert f"AND l.expiry_date > {today}) AS sellable" in text


def test_unknown_medicine_lots_returns_404(client, monkeypatch):
    login_as("staff")
    use_rules(monkeypatch, [("FROM public.medicines WHERE id", None)])
    assert_error(client.get(f"/api/v1/medicines/{MED}/lots"), 404, "NOT_FOUND")


def test_get_lot_staff_without_cost_and_manager_with_cost(client, monkeypatch):
    use_rules(monkeypatch, [("FROM public.medicine_lots l", lot_row(sellable=False, days_remaining=0))])
    login_as("staff")
    body = client.get(f"/api/v1/lots/{LOT}").json()
    assert "cost_per_unit" not in body and body["sellable"] is False
    login_as("owner")
    assert client.get(f"/api/v1/lots/{LOT}").json()["cost_per_unit"] == "12.50"


def test_get_unknown_lot_returns_404(client, monkeypatch):
    login_as("staff")
    use_rules(monkeypatch, [("FROM public.medicine_lots l", None)])
    body = assert_error(client.get(f"/api/v1/lots/{LOT}"), 404, "NOT_FOUND")
    assert body["error"]["message"] == "ไม่พบข้อมูล Lot"


def test_staff_cannot_view_lot_transactions(client):
    login_as("staff")
    assert_error(client.get(f"/api/v1/lots/{LOT}/transactions"), 403, "FORBIDDEN")


def test_manager_views_transactions_newest_first(client, monkeypatch):
    login_as("pharmacist")
    tx = {
        "id": uuid.uuid4(), "medicine_lot_id": LOT, "transaction_type": "sale", "quantity_change": -2,
        "quantity_before": 5, "quantity_after": 3, "reference_type": "sale", "reference_id": uuid.uuid4(),
        "notes": None, "created_by": uuid.uuid4(), "created_at": NOW,
    }
    cursor = use_rules(monkeypatch, [
        ("SELECT 1 AS found FROM public.medicine_lots", {"found": 1}),
        ("count(*) AS total", {"total": 1}),
        ("FROM public.inventory_transactions", [tx]),
    ])
    resp = client.get(f"/api/v1/lots/{LOT}/transactions?limit=10&offset=0")
    assert resp.status_code == 200, resp.text
    assert resp.json()["items"][0]["quantity_change"] == -2
    assert "ORDER BY created_at DESC, id DESC" in cursor.queries("ORDER BY created_at")[0][0]


def test_transactions_unknown_lot_returns_404(client, monkeypatch):
    login_as("owner")
    use_rules(monkeypatch, [("SELECT 1 AS found FROM public.medicine_lots", None)])
    assert_error(client.get(f"/api/v1/lots/{LOT}/transactions"), 404, "NOT_FOUND")
