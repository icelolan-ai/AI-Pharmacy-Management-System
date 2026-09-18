"""Unit tests for medicines endpoints (task 3.6). No real database."""

import json
import uuid
from datetime import date
from decimal import Decimal
from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient
from psycopg.errors import UniqueViolation

from app import db
from app.audit import dumps_audit_value
from app.auth import get_current_user
from app.main import app
from app.schemas.common import escape_like
from app.schemas.medicine import MedicineCreate
from app.services import medicines as medicine_service
from tests.helpers import NOW, FakeCursor, assert_error, fake_transaction, make_user

MED_ID = uuid.uuid4()


def medicine_row(**overrides):
    row = {
        "id": MED_ID,
        "name": "Paracetamol 500 mg",
        "generic_name": "Paracetamol",
        "strength": "500 mg",
        "dosage_form": "Tablet",
        "manufacturer": None,
        "category": "Analgesic",
        "barcode": "8850000000001",
        "active_ingredient": None,
        "unit": "กล่อง",
        "reorder_point": 10,
        "selling_price": Decimal("95.00"),
        "is_active": True,
        "available_quantity": 0,
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


class DuplicateBarcode(UniqueViolation):
    @property
    def diag(self):
        return SimpleNamespace(constraint_name="medicines_barcode_key")


# --- roles ---------------------------------------------------------------------------


def test_staff_can_list_medicines(client, monkeypatch):
    login_as("staff")
    monkeypatch.setattr(
        medicine_service,
        "list_medicines",
        lambda **kw: {"items": [medicine_row()], "total": 1, **{k: kw[k] for k in ("limit", "offset")}},
    )
    resp = client.get("/api/v1/medicines")
    assert resp.status_code == 200
    body = resp.json()
    assert body["total"] == 1 and body["limit"] == 50 and body["offset"] == 0
    assert set(body) == {"items", "total", "limit", "offset"}


def test_staff_cannot_create_medicine(client):
    login_as("staff")
    assert_error(client.post("/api/v1/medicines", json={"name": "X"}), 403, "FORBIDDEN")


def test_staff_cannot_patch_medicine(client):
    login_as("staff")
    assert_error(
        client.patch(f"/api/v1/medicines/{MED_ID}", json={"name": "X"}), 403, "FORBIDDEN"
    )


def test_pharmacist_can_create_medicine(client, monkeypatch):
    user = login_as("pharmacist")
    captured = {}

    def fake_create(data, actor_id):
        captured["data"], captured["actor"] = data, actor_id
        return medicine_row(name=data.name, selling_price=data.selling_price)

    monkeypatch.setattr(medicine_service, "create_medicine", fake_create)
    resp = client.post(
        "/api/v1/medicines",
        json={"name": "  Paracetamol 500 mg  ", "selling_price": "95", "barcode": ""},
    )
    assert resp.status_code == 201, resp.text
    assert captured["actor"] == user.id
    assert captured["data"].name == "Paracetamol 500 mg"
    assert captured["data"].barcode is None
    assert resp.json()["selling_price"] == "95.00"


def test_unauthenticated_request_returns_401(client):
    assert_error(client.get("/api/v1/medicines"), 401, "UNAUTHENTICATED")


# --- validation ------------------------------------------------------------------------


@pytest.mark.parametrize(
    "payload",
    [
        {"name": ""},
        {"name": "   "},
        {},
        {"name": "X", "selling_price": "-1.00"},
        {"name": "X", "selling_price": "95.125"},
        {"name": "X", "reorder_point": -1},
        {"name": "X", "id": str(uuid.uuid4())},
        {"name": "X", "store_id": str(uuid.uuid4())},
        {"name": "X", "created_at": "2026-01-01T00:00:00Z"},
        {"name": "X", "updated_at": "2026-01-01T00:00:00Z"},
        {"name": "X", "is_active": False},
    ],
    ids=[
        "name-empty",
        "name-blank",
        "name-missing",
        "price-negative",
        "price-3-decimals",
        "reorder-negative",
        "id-sent",
        "store_id-sent",
        "created_at-sent",
        "updated_at-sent",
        "is_active-on-post",
    ],
)
def test_create_medicine_invalid_payload_returns_400(client, payload):
    login_as("owner")
    assert_error(client.post("/api/v1/medicines", json=payload), 400, "VALIDATION_ERROR")


def test_patch_rejects_null_name_and_id(client):
    login_as("owner")
    assert_error(
        client.patch(f"/api/v1/medicines/{MED_ID}", json={"name": None}), 400, "VALIDATION_ERROR"
    )
    assert_error(
        client.patch(f"/api/v1/medicines/{MED_ID}", json={"id": str(uuid.uuid4())}),
        400,
        "VALIDATION_ERROR",
    )


def test_limit_over_200_returns_400(client):
    login_as("staff")
    assert_error(client.get("/api/v1/medicines?limit=201"), 400, "VALIDATION_ERROR")
    assert_error(client.get("/api/v1/medicines?offset=-1"), 400, "VALIDATION_ERROR")


def test_invalid_uuid_path_returns_400(client):
    login_as("staff")
    assert_error(client.get("/api/v1/medicines/not-a-uuid"), 400, "VALIDATION_ERROR")


# --- service behaviour with a fake cursor ----------------------------------------------------


def test_duplicate_barcode_returns_409(client, monkeypatch):
    login_as("owner")
    cursor = FakeCursor(raise_on_execute={0: DuplicateBarcode("duplicate key")})
    monkeypatch.setattr(db, "get_transaction", fake_transaction(cursor))
    body = assert_error(
        client.post("/api/v1/medicines", json={"name": "X", "barcode": "8850000000001"}),
        409,
        "DUPLICATE",
    )
    assert body["error"]["message"] == "Barcode นี้มีอยู่ในระบบแล้ว"


def test_get_missing_medicine_returns_404(client, monkeypatch):
    login_as("staff")
    monkeypatch.setattr(db, "get_transaction", fake_transaction(FakeCursor(fetchone=[None])))
    body = assert_error(client.get(f"/api/v1/medicines/{MED_ID}"), 404, "NOT_FOUND")
    assert body["error"]["message"] == "ไม่พบข้อมูลยา"


def test_get_missing_barcode_returns_404(client, monkeypatch):
    login_as("staff")
    monkeypatch.setattr(db, "get_transaction", fake_transaction(FakeCursor(fetchone=[None])))
    assert_error(client.get("/api/v1/medicines/by-barcode/0000"), 404, "NOT_FOUND")


def test_patch_missing_medicine_returns_404(client, monkeypatch):
    login_as("owner")
    monkeypatch.setattr(db, "get_transaction", fake_transaction(FakeCursor(fetchone=[None])))
    assert_error(
        client.patch(f"/api/v1/medicines/{MED_ID}", json={"name": "Y"}), 404, "NOT_FOUND"
    )


def test_patch_empty_body_returns_400(client):
    login_as("owner")
    assert_error(client.patch(f"/api/v1/medicines/{MED_ID}", json={}), 400, "VALIDATION_ERROR")


def test_patch_without_real_change_returns_400(client, monkeypatch):
    login_as("owner")
    current = medicine_row()
    cursor = FakeCursor(fetchone=[current])
    monkeypatch.setattr(db, "get_transaction", fake_transaction(cursor))
    assert_error(
        client.patch(
            f"/api/v1/medicines/{MED_ID}",
            json={"name": current["name"], "selling_price": "95.0"},
        ),
        400,
        "VALIDATION_ERROR",
    )
    # Only the SELECT ... FOR UPDATE ran; no UPDATE and no audit insert.
    assert len(cursor.executed) == 1


def test_create_writes_audit_in_same_transaction(monkeypatch):
    inserted = {k: v for k, v in medicine_row().items() if k != "available_quantity"}
    cursor = FakeCursor(fetchone=[inserted, medicine_row()])
    monkeypatch.setattr(db, "get_transaction", fake_transaction(cursor))
    actor = uuid.uuid4()
    medicine_service.create_medicine(MedicineCreate(name="Paracetamol 500 mg"), actor)
    queries = [str(q) for q, _ in cursor.executed]
    assert len(cursor.executed) == 3
    assert "audit_logs" in queries[1]
    params = cursor.executed[1][1]
    assert params[0] == "medicines" and params[1] == MED_ID and params[2] == "insert"
    assert params[5] == actor


def test_patch_writes_old_and_new_values_to_audit(monkeypatch):
    current = {k: v for k, v in medicine_row().items() if k != "available_quantity"}
    updated = {**current, "selling_price": Decimal("99.50")}
    cursor = FakeCursor(fetchone=[current, updated, medicine_row(selling_price=Decimal("99.50"))])
    monkeypatch.setattr(db, "get_transaction", fake_transaction(cursor))
    from app.schemas.medicine import MedicineUpdate

    medicine_service.update_medicine(MED_ID, MedicineUpdate(selling_price="99.50"), uuid.uuid4())
    audit_params = cursor.executed[2][1]
    assert audit_params[2] == "update"
    assert audit_params[3].obj["selling_price"] == Decimal("95.00")
    assert audit_params[4].obj["selling_price"] == Decimal("99.50")


# --- response format & helpers -----------------------------------------------------------------


def test_money_fields_are_strings(client, monkeypatch):
    login_as("staff")
    monkeypatch.setattr(
        medicine_service, "get_medicine", lambda medicine_id: medicine_row(selling_price=Decimal("80.5"))
    )
    body = client.get(f"/api/v1/medicines/{MED_ID}").json()
    assert body["selling_price"] == "80.50"
    assert isinstance(body["available_quantity"], int)
    for forbidden in ("cost_per_unit", "unit_cost", "stock_value", "store_id"):
        assert forbidden not in body

    monkeypatch.setattr(medicine_service, "get_medicine", lambda medicine_id: medicine_row(selling_price=None))
    assert client.get(f"/api/v1/medicines/{MED_ID}").json()["selling_price"] is None


def test_escape_like_escapes_wildcards():
    assert escape_like("50%_off\\x") == "50\\%\\_off\\\\x"


def test_list_search_uses_escaped_pattern(monkeypatch):
    cursor = FakeCursor(fetchone=[{"total": 0}], fetchall=[[]])
    monkeypatch.setattr(db, "get_transaction", fake_transaction(cursor))
    medicine_service.list_medicines(q=" 10%_x ", category=None, is_active=True, limit=50, offset=0)
    params = cursor.executed[1][1]
    assert params == [True, "%10\\%\\_x%", "%10\\%\\_x%", "10%_x", 50, 0]


def test_audit_json_handles_decimal_uuid_dates():
    uid = uuid.uuid4()
    text = dumps_audit_value(
        {"price": Decimal("95.00"), "id": uid, "d": date(2027, 6, 30), "t": NOW, "name": "ยา"}
    )
    data = json.loads(text)
    assert data == {
        "price": "95.00",
        "id": str(uid),
        "d": "2027-06-30",
        "t": NOW.isoformat(),
        "name": "ยา",
    }


# --- unit of count (หน่วยนับ, migration 004) ---------------------------------------------------


def test_create_without_unit_leaves_the_column_to_its_default(monkeypatch):
    """No unit sent -> the column is left out of the INSERT, so the DB default 'กล่อง' wins."""
    inserted = {k: v for k, v in medicine_row().items() if k != "available_quantity"}
    cursor = FakeCursor(fetchone=[inserted, medicine_row()])
    monkeypatch.setattr(db, "get_transaction", fake_transaction(cursor))

    row = medicine_service.create_medicine(MedicineCreate(name="Paracetamol 500 mg"), uuid.uuid4())

    insert_sql, params = cursor.executed[0]
    assert '"unit"' not in insert_sql.as_string()
    assert len(params) == insert_sql.as_string().count("%s")
    assert row["unit"] == "กล่อง"


def test_create_with_unit_stores_and_returns_it(monkeypatch):
    inserted = {
        k: v for k, v in medicine_row(unit="ขวด").items() if k != "available_quantity"
    }
    cursor = FakeCursor(fetchone=[inserted, medicine_row(unit="ขวด")])
    monkeypatch.setattr(db, "get_transaction", fake_transaction(cursor))

    row = medicine_service.create_medicine(
        MedicineCreate(name="Paracetamol 500 mg", unit="  ขวด  "), uuid.uuid4()
    )

    insert_sql, params = cursor.executed[0]
    assert '"unit"' in insert_sql.as_string()
    assert "ขวด" in params
    assert row["unit"] == "ขวด"


def test_unit_is_returned_by_the_api(client, monkeypatch):
    login_as("staff")
    monkeypatch.setattr(
        medicine_service, "get_medicine", lambda medicine_id: medicine_row(unit="ขวด")
    )
    assert client.get(f"/api/v1/medicines/{MED_ID}").json()["unit"] == "ขวด"


def test_patch_can_change_unit(client, monkeypatch):
    login_as("owner")
    captured = {}

    def fake_update(medicine_id, data, actor_id):
        captured["unit"] = data.unit
        return medicine_row(unit=data.unit)

    monkeypatch.setattr(medicine_service, "update_medicine", fake_update)
    resp = client.patch(f"/api/v1/medicines/{MED_ID}", json={"unit": "แผง"})
    assert resp.status_code == 200, resp.text
    assert captured["unit"] == "แผง" and resp.json()["unit"] == "แผง"


@pytest.mark.parametrize("value", [None, "", "   "])
def test_patch_cannot_clear_unit(client, value):
    """unit is NOT NULL in the database, so it may be changed but never emptied."""
    login_as("owner")
    assert_error(
        client.patch(f"/api/v1/medicines/{MED_ID}", json={"unit": value}), 400, "VALIDATION_ERROR"
    )
