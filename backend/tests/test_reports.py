"""Unit tests for reports (task 3.9, spec 9.7). No real database."""

import uuid
from datetime import date, timedelta
from decimal import Decimal

import pytest
from fastapi.testclient import TestClient

from app import db
from app.auth import get_current_user
from app.main import app
from app.services import reports as report_service
from tests.helpers import MatchCursor, assert_error, fake_transaction, make_user

TODAY = date(2026, 9, 17)
TODAY_SQL = "((now()) AT TIME ZONE 'Asia/Bangkok')::date"
MED = uuid.uuid4()
VALUE_FIELDS = ("available_value", "expired_value", "stock_value", "total_value", "sellable_value", "cost")


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


def stock_row(**overrides):
    row = {"medicine_id": MED, "name": "TEST", "strength": "500 mg", "category": None,
           "unit": "กล่อง", "reorder_point": 5, "available_quantity": 3, "expired_quantity": 2,
           "available_value": Decimal("24.75"), "expired_value": Decimal("25")}
    row.update(overrides)
    return row


def lot_row(days, **overrides):
    row = {"lot_id": uuid.uuid4(), "medicine_id": MED, "medicine_name": "TEST", "unit": "กล่อง",
           "lot_number": f"L{days}",
           "quantity_remaining": 3, "expiry_date": TODAY + timedelta(days=days), "received_date": TODAY,
           "days_remaining": days, "stock_value": Decimal("24.75")}
    row.update(overrides)
    return row


STOCK_RULES = [("count(*) AS total", {"total": 1}), ("GROUP BY m.id", [stock_row()])]
EXPIRING_RULES = [
    ("GROUP BY 1", [{"risk_level": "critical", "lot_count": 1, "stock_value": Decimal("24.75")}]),
    ("SELECT * FROM expiring", [lot_row(20)]),
]
EXPIRED_RULES = [
    ("count(*) AS total", {"total": 1}),
    ("days_expired", [{**lot_row(0), "days_expired": 0}]),
]


# --- risk levels -----------------------------------------------------------------------------------


@pytest.mark.parametrize(
    "days,level",
    [(1, "critical"), (30, "critical"), (31, "high_risk"), (90, "high_risk"), (91, "warning"),
     (180, "warning"), (181, "normal"), (3650, "normal")],
)
def test_risk_level_boundaries(days, level):
    assert report_service.risk_level(days) == level


def test_sql_risk_case_matches_python_thresholds():
    text = report_service.risk_case_sql("days_remaining").as_string()
    assert text == (
        'CASE WHEN "days_remaining" <= 30 THEN \'critical\' WHEN "days_remaining" <= 90 THEN \'high_risk\' '
        'WHEN "days_remaining" <= 180 THEN \'warning\' ELSE \'normal\' END'
    )


# --- D10 / D9 boundaries in SQL -------------------------------------------------------------------------


def test_lot_expiring_today_is_in_expired_not_expiring(client, monkeypatch):
    login_as("owner")
    cursor = use_rules(monkeypatch, EXPIRING_RULES)
    client.get("/api/v1/reports/expiring")
    expiring_sql = cursor.queries("WITH expiring")[0][0]
    assert f"l.expiry_date > {TODAY_SQL}" in expiring_sql
    assert f"l.expiry_date <= {TODAY_SQL} + %s" in expiring_sql

    cursor = use_rules(monkeypatch, EXPIRED_RULES)
    client.get("/api/v1/reports/expired")
    expired_sql = cursor.queries("days_expired")[0][0]
    assert f"l.expiry_date <= {TODAY_SQL}" in expired_sql
    assert f"({TODAY_SQL} - l.expiry_date) AS days_expired" in expired_sql


def test_every_report_excludes_inactive_medicines_and_uses_business_today(client, monkeypatch):
    login_as("owner")
    endpoints = [
        ("/api/v1/reports/stock", STOCK_RULES),
        ("/api/v1/reports/expiring", EXPIRING_RULES),
        ("/api/v1/reports/expired", EXPIRED_RULES),
        ("/api/v1/reports/low-stock", [("count(*) AS total", {"total": 0}), ("ORDER BY shortage", [])]),
        ("/api/v1/reports/inventory-value", [
            ("count(DISTINCT m.id)", {"total": 0}),
            ("GROUP BY m.category", []),
            ("GROUP BY m.id", []),
            ("AS total_value", {"total_value": 0, "sellable_value": 0, "expired_value": 0}),
        ]),
    ]
    for path, rules in endpoints:
        cursor = use_rules(monkeypatch, rules)
        assert client.get(path).status_code == 200, path
        for text, _ in cursor.executed:
            assert "m.is_active = true" in text, (path, text)
            assert "CURRENT_DATE" not in text.upper(), path
        assert any(TODAY_SQL in text for text, _ in cursor.executed), path


@pytest.mark.parametrize("days", ["0", "-1", "3651", "abc"])
def test_expiring_days_out_of_range_returns_400(client, days):
    login_as("staff")
    assert_error(client.get(f"/api/v1/reports/expiring?days={days}"), 400, "VALIDATION_ERROR")


def test_expiring_default_days_is_180(client, monkeypatch):
    login_as("staff")
    cursor = use_rules(monkeypatch, EXPIRING_RULES)
    client.get("/api/v1/reports/expiring")
    assert cursor.queries("GROUP BY 1")[0][1] == (180,)


def test_expiring_items_and_summary(client, monkeypatch):
    login_as("owner")
    use_rules(monkeypatch, [
        ("GROUP BY 1", [{"risk_level": "critical", "lot_count": 1, "stock_value": Decimal("24.75")},
                        {"risk_level": "normal", "lot_count": 1, "stock_value": Decimal("10")}]),
        ("SELECT * FROM expiring", [lot_row(30), lot_row(200)]),
    ])
    body = client.get("/api/v1/reports/expiring?days=365").json()
    assert [i["risk_level"] for i in body["items"]] == ["critical", "normal"]
    assert body["total"] == 2
    assert body["summary"] == {
        "critical": {"lot_count": 1, "stock_value": "24.75"},
        "high_risk": {"lot_count": 0, "stock_value": "0.00"},
        "warning": {"lot_count": 0, "stock_value": "0.00"},
        "normal": {"lot_count": 1, "stock_value": "10.00"},
    }


# --- staff visibility --------------------------------------------------------------------------------------


def assert_no_value_fields(text):
    for field in VALUE_FIELDS:
        assert field not in text, field


def test_staff_sees_no_values_in_stock_expiring_expired(client, monkeypatch):
    login_as("staff")
    use_rules(monkeypatch, STOCK_RULES)
    resp = client.get("/api/v1/reports/stock")
    assert resp.status_code == 200 and resp.json()["items"][0]["available_quantity"] == 3
    assert_no_value_fields(resp.text)

    use_rules(monkeypatch, EXPIRING_RULES)
    resp = client.get("/api/v1/reports/expiring")
    assert resp.status_code == 200 and resp.json()["summary"]["critical"] == {"lot_count": 1}
    assert_no_value_fields(resp.text)

    use_rules(monkeypatch, EXPIRED_RULES)
    resp = client.get("/api/v1/reports/expired")
    assert resp.status_code == 200 and resp.json()["items"][0]["days_expired"] == 0
    assert_no_value_fields(resp.text)


def test_manager_sees_values_as_strings(client, monkeypatch):
    login_as("pharmacist")
    use_rules(monkeypatch, STOCK_RULES)
    item = client.get("/api/v1/reports/stock").json()["items"][0]
    assert item["available_value"] == "24.75" and item["expired_value"] == "25.00"

    use_rules(monkeypatch, EXPIRED_RULES)
    assert client.get("/api/v1/reports/expired").json()["items"][0]["stock_value"] == "24.75"


@pytest.mark.parametrize("role", ["staff", "pharmacist"])
def test_only_owner_can_view_inventory_value(client, role):
    """D20: inventory-value is owner only."""
    login_as(role)
    assert_error(client.get("/api/v1/reports/inventory-value"), 403, "FORBIDDEN")


# --- low stock, inventory value ------------------------------------------------------------------------------


def test_low_stock_sorted_by_shortage_desc(client, monkeypatch):
    login_as("staff")
    rows = [
        {"medicine_id": uuid.uuid4(), "name": "B", "available_quantity": 0, "reorder_point": 10, "shortage": 10},
        {"medicine_id": uuid.uuid4(), "name": "A", "available_quantity": 3, "reorder_point": 5, "shortage": 2},
    ]
    cursor = use_rules(monkeypatch, [("count(*) AS total", {"total": 2}), ("ORDER BY shortage", rows)])
    body = client.get("/api/v1/reports/low-stock").json()
    assert [i["shortage"] for i in body["items"]] == [10, 2]
    query = cursor.queries("ORDER BY shortage")[0][0]
    assert "ORDER BY shortage DESC" in query
    assert "m.reorder_point IS NOT NULL" in query and "available_quantity <= reorder_point" in query
    assert f"l.expiry_date > {TODAY_SQL}" in query


def test_inventory_value_null_category_label_and_strings(client, monkeypatch):
    login_as("owner")
    use_rules(monkeypatch, [
        ("count(DISTINCT m.id)", {"total": 1}),
        ("GROUP BY m.category", [
            {"category": None, "total_value": Decimal("24.75"), "sellable_value": Decimal("24.75"), "expired_value": Decimal("0")},
            {"category": "Analgesic", "total_value": Decimal("5"), "sellable_value": Decimal("0"), "expired_value": Decimal("5")},
        ]),
        ("GROUP BY m.id", [{"medicine_id": MED, "name": "TEST", "total_value": Decimal("24.75"),
                            "sellable_value": Decimal("24.75"), "expired_value": Decimal("0")}]),
        ("AS total_value", {"total_value": Decimal("29.75"), "sellable_value": Decimal("24.75"), "expired_value": Decimal("5")}),
    ])
    body = client.get("/api/v1/reports/inventory-value").json()
    assert (body["total_value"], body["sellable_value"], body["expired_value"]) == ("29.75", "24.75", "5.00")
    assert [c["category"] for c in body["by_category"]] == ["ไม่ระบุหมวดหมู่", "Analgesic"]
    assert body["by_medicine"]["items"][0]["total_value"] == "24.75"
    assert body["by_medicine"]["total"] == 1


def test_category_label_helper():
    assert report_service.category_label(None) == "ไม่ระบุหมวดหมู่"
    assert report_service.category_label("") == "ไม่ระบุหมวดหมู่"
    assert report_service.category_label("Vitamin") == "Vitamin"


def test_reports_require_login(client):
    assert_error(client.get("/api/v1/reports/stock"), 401, "UNAUTHENTICATED")


# --- unit of count (หน่วยนับ, migration 004) ---------------------------------------------------


@pytest.mark.parametrize("role", ["owner", "staff"])
def test_stock_report_returns_the_unit(client, monkeypatch, role):
    login_as(role)
    cursor = use_rules(monkeypatch, [("count(*) AS total", {"total": 1}),
                                     ("GROUP BY m.id", [stock_row(unit="ขวด")])])
    body = client.get("/api/v1/reports/stock").json()
    assert body["items"][0]["unit"] == "ขวด"
    rows_sql = cursor.queries("GROUP BY m.id")[0][0]
    assert "m.unit" in rows_sql


@pytest.mark.parametrize("role", ["owner", "staff"])
def test_expiring_report_returns_the_unit(client, monkeypatch, role):
    login_as(role)
    cursor = use_rules(monkeypatch, [
        ("GROUP BY 1", [{"risk_level": "critical", "lot_count": 1, "stock_value": Decimal("24.75")}]),
        ("SELECT * FROM expiring", [lot_row(20, unit="ขวด")]),
    ])
    body = client.get("/api/v1/reports/expiring").json()
    assert body["items"][0]["unit"] == "ขวด"
    assert "m.unit" in cursor.queries("SELECT * FROM expiring")[0][0]
