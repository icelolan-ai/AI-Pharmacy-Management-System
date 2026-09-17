"""Unit tests for GET /api/v1/audit-logs (task 3.9, spec 9.8). No real database."""

import uuid
from datetime import date

import pytest
from fastapi.testclient import TestClient

from app import db
from app.auth import get_current_user
from app.main import app
from tests.helpers import NOW, MatchCursor, assert_error, fake_transaction, make_user

TODAY_START = "((%s::date)::timestamp AT TIME ZONE 'Asia/Bangkok')"


@pytest.fixture
def client():
    yield TestClient(app)
    app.dependency_overrides.clear()


def login_as(role):
    user = make_user(role)
    app.dependency_overrides[get_current_user] = lambda: user
    return user


def use_logs(monkeypatch, rows):
    cursor = MatchCursor([("count(*) AS total", {"total": len(rows)}), ("FROM public.audit_logs a", rows)])
    monkeypatch.setattr(db, "get_transaction", fake_transaction(cursor))
    return cursor


def log_row():
    return {
        "id": uuid.uuid4(), "table_name": "medicine_lots", "record_id": uuid.uuid4(), "action": "update",
        "old_value": {"quantity_remaining": 3, "status": "active"},
        "new_value": {"quantity_remaining": 2, "status": "active"},
        "changed_by": uuid.uuid4(), "changed_by_name": "ice boonak", "reason": "TEST ทดสอบ", "created_at": NOW,
    }


@pytest.mark.parametrize("role", ["staff", "pharmacist"])
def test_non_owner_forbidden(client, role):
    login_as(role)
    assert_error(client.get("/api/v1/audit-logs"), 403, "FORBIDDEN")


def test_owner_lists_logs_with_fields(client, monkeypatch):
    login_as("owner")
    row = log_row()
    cursor = use_logs(monkeypatch, [row])
    resp = client.get(f"/api/v1/audit-logs?table_name=medicine_lots&record_id={row['record_id']}")
    assert resp.status_code == 200, resp.text
    item = resp.json()["items"][0]
    assert set(item) == {"id", "table_name", "record_id", "action", "old_value", "new_value",
                         "changed_by", "changed_by_name", "reason", "created_at"}
    assert item["changed_by_name"] == "ice boonak" and item["old_value"]["quantity_remaining"] == 3
    query, params = cursor.queries("ORDER BY a.created_at")[0]
    assert "ORDER BY a.created_at DESC, a.id DESC" in query
    assert "LEFT JOIN public.user_profiles p ON p.id = a.changed_by" in query
    assert params[:2] == ["medicine_lots", row["record_id"]]


def test_unknown_table_name_returns_400(client):
    login_as("owner")
    assert_error(client.get("/api/v1/audit-logs?table_name=users"), 400, "VALIDATION_ERROR")
    assert_error(client.get("/api/v1/audit-logs?table_name=medicines;drop"), 400, "VALIDATION_ERROR")


def test_invalid_uuid_filters_return_400(client):
    login_as("owner")
    assert_error(client.get("/api/v1/audit-logs?record_id=abc"), 400, "VALIDATION_ERROR")
    assert_error(client.get("/api/v1/audit-logs?changed_by=abc"), 400, "VALIDATION_ERROR")


def test_date_filters_use_store_local_days(client, monkeypatch):
    login_as("owner")
    cursor = use_logs(monkeypatch, [])
    client.get("/api/v1/audit-logs?date_from=2026-09-17&date_to=2026-09-17")
    query, params = cursor.queries("ORDER BY a.created_at")[0]
    assert f"a.created_at >= {TODAY_START}" in query
    assert f"a.created_at < {TODAY_START}" in query
    assert params[:2] == [date(2026, 9, 17), date(2026, 9, 18)]


def test_date_range_reversed_returns_400(client):
    login_as("owner")
    assert_error(client.get("/api/v1/audit-logs?date_from=2026-09-18&date_to=2026-09-17"), 400, "VALIDATION_ERROR")


def test_audit_logs_require_login(client):
    assert_error(client.get("/api/v1/audit-logs"), 401, "UNAUTHENTICATED")
