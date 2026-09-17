"""Unit tests for suppliers endpoints (task 3.6). No real database."""

import uuid

import pytest
from fastapi.testclient import TestClient

from app import db
from app.auth import get_current_user
from app.main import app
from app.services import suppliers as supplier_service
from tests.helpers import NOW, FakeCursor, assert_error, fake_transaction, make_user

SUP_ID = uuid.uuid4()


def supplier_row(**overrides):
    row = {
        "id": SUP_ID,
        "name": "ABC Pharma",
        "contact_person": "Somchai",
        "phone": "021234567",
        "email": "sales@abc.example",
        "address": None,
        "lead_time_days": 3,
        "created_at": NOW,
        "updated_at": NOW,
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


@pytest.mark.parametrize(
    "method,path,payload",
    [
        ("get", "/api/v1/suppliers", None),
        ("get", f"/api/v1/suppliers/{SUP_ID}", None),
        ("post", "/api/v1/suppliers", {"name": "X"}),
        ("patch", f"/api/v1/suppliers/{SUP_ID}", {"name": "X"}),
    ],
    ids=["list", "get", "create", "patch"],
)
def test_staff_forbidden_on_all_supplier_endpoints(client, method, path, payload):
    login_as("staff")
    kwargs = {"json": payload} if payload is not None else {}
    assert_error(getattr(client, method)(path, **kwargs), 403, "FORBIDDEN")


def test_pharmacist_can_list_suppliers(client, monkeypatch):
    login_as("pharmacist")
    monkeypatch.setattr(
        supplier_service,
        "list_suppliers",
        lambda **kw: {"items": [supplier_row()], "total": 1, "limit": kw["limit"], "offset": kw["offset"]},
    )
    resp = client.get("/api/v1/suppliers?q=abc&limit=10")
    assert resp.status_code == 200
    assert resp.json()["limit"] == 10


def test_pharmacist_can_create_supplier(client, monkeypatch):
    user = login_as("pharmacist")
    captured = {}

    def fake_create(data, actor_id):
        captured["data"], captured["actor"] = data, actor_id
        return supplier_row(name=data.name)

    monkeypatch.setattr(supplier_service, "create_supplier", fake_create)
    resp = client.post(
        "/api/v1/suppliers",
        json={"name": " ABC Pharma ", "email": "sales@abc.example", "phone": ""},
    )
    assert resp.status_code == 201, resp.text
    assert captured["actor"] == user.id
    assert captured["data"].name == "ABC Pharma"
    assert captured["data"].phone is None


@pytest.mark.parametrize(
    "payload",
    [
        {"name": ""},
        {},
        {"name": "X", "email": "not-an-email"},
        {"name": "X", "email": "a@b"},
        {"name": "X", "lead_time_days": -1},
        {"name": "X", "id": str(uuid.uuid4())},
        {"name": "X", "store_id": str(uuid.uuid4())},
    ],
    ids=["name-empty", "name-missing", "email-bad", "email-no-tld", "lead-negative", "id-sent", "store_id-sent"],
)
def test_create_supplier_invalid_payload_returns_400(client, payload):
    login_as("owner")
    assert_error(client.post("/api/v1/suppliers", json=payload), 400, "VALIDATION_ERROR")


def test_limit_over_200_returns_400(client):
    login_as("owner")
    assert_error(client.get("/api/v1/suppliers?limit=500"), 400, "VALIDATION_ERROR")


def test_get_missing_supplier_returns_404(client, monkeypatch):
    login_as("owner")
    monkeypatch.setattr(db, "get_transaction", fake_transaction(FakeCursor(fetchone=[None])))
    body = assert_error(client.get(f"/api/v1/suppliers/{SUP_ID}"), 404, "NOT_FOUND")
    assert body["error"]["message"] == "ไม่พบข้อมูลผู้จำหน่าย"


def test_patch_missing_supplier_returns_404(client, monkeypatch):
    login_as("owner")
    monkeypatch.setattr(db, "get_transaction", fake_transaction(FakeCursor(fetchone=[None])))
    assert_error(
        client.patch(f"/api/v1/suppliers/{SUP_ID}", json={"name": "Y"}), 404, "NOT_FOUND"
    )


def test_patch_supplier_without_change_returns_400(client, monkeypatch):
    login_as("owner")
    cursor = FakeCursor(fetchone=[supplier_row()])
    monkeypatch.setattr(db, "get_transaction", fake_transaction(cursor))
    assert_error(
        client.patch(f"/api/v1/suppliers/{SUP_ID}", json={"name": "ABC Pharma"}),
        400,
        "VALIDATION_ERROR",
    )
    assert len(cursor.executed) == 1


def test_create_supplier_writes_audit(monkeypatch):
    from app.schemas.supplier import SupplierCreate

    cursor = FakeCursor(fetchone=[supplier_row(), supplier_row()])
    monkeypatch.setattr(db, "get_transaction", fake_transaction(cursor))
    actor = uuid.uuid4()
    supplier_service.create_supplier(SupplierCreate(name="ABC Pharma"), actor)
    audit_params = cursor.executed[1][1]
    assert "audit_logs" in str(cursor.executed[1][0])
    assert audit_params[0] == "suppliers" and audit_params[2] == "insert" and audit_params[5] == actor
