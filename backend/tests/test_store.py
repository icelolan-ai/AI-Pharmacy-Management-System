"""Unit tests for the store profile endpoints (ข้อมูลร้าน). No real database."""

import uuid

import pytest
from fastapi.testclient import TestClient

from app import db
from app.auth import get_current_user
from app.main import app
from app.schemas.store import StoreProfileUpdate
from app.services import store as store_service
from tests.helpers import NOW, FakeCursor, MatchCursor, assert_error, fake_transaction, make_user

STORE_ID = uuid.uuid4()
ACTOR_ID = uuid.uuid4()


def store_row(**overrides):
    row = {
        "id": STORE_ID,
        "name": "ร้านยาสุขภาพดี",
        "address": "123 ถนนสุขุมวิท กรุงเทพฯ",
        "phone": "021234567",
        "license_no": "ขย.1/2569",
        "tax_id": "0105560000000",
        "updated_at": NOW,
        "updated_by": ACTOR_ID,
    }
    row.update(overrides)
    return row


def store_out_row(**overrides):
    return {**store_row(), "updated_by_name": "ice boonak", **overrides}


@pytest.fixture
def client():
    yield TestClient(app)
    app.dependency_overrides.clear()


def login_as(role):
    user = make_user(role)
    app.dependency_overrides[get_current_user] = lambda: user
    return user


# --- roles ---------------------------------------------------------------------------


@pytest.mark.parametrize("role", ["owner", "pharmacist", "staff"])
def test_any_signed_in_role_can_read_the_store_profile(client, monkeypatch, role):
    login_as(role)
    monkeypatch.setattr(store_service, "get_store_profile", store_out_row)
    resp = client.get("/api/v1/store")
    assert resp.status_code == 200, resp.text
    assert resp.json()["name"] == "ร้านยาสุขภาพดี"


def test_unauthenticated_request_returns_401(client):
    assert_error(client.get("/api/v1/store"), 401, "UNAUTHENTICATED")


@pytest.mark.parametrize("role", ["staff", "pharmacist"])
def test_only_owner_can_edit_the_store_profile(client, role):
    login_as(role)
    assert_error(client.patch("/api/v1/store", json={"name": "X"}), 403, "FORBIDDEN")


def test_owner_can_edit_the_store_profile(client, monkeypatch):
    user = login_as("owner")
    captured = {}

    def fake_update(data, actor_id):
        captured["data"], captured["actor"] = data, actor_id
        return store_out_row(name=data.name)

    monkeypatch.setattr(store_service, "update_store_profile", fake_update)
    resp = client.patch("/api/v1/store", json={"name": "  ร้านยาสุขภาพดี  ", "phone": ""})
    assert resp.status_code == 200, resp.text
    assert captured["actor"] == user.id
    assert captured["data"].name == "ร้านยาสุขภาพดี"
    assert captured["data"].phone is None


# --- an unsaved profile is not an error -------------------------------------------------


def test_get_returns_200_with_null_fields_when_never_saved(client, monkeypatch):
    """D21: the shop that has not filled the form in yet gets nulls, never a 404."""
    login_as("staff")
    monkeypatch.setattr(db, "get_transaction", fake_transaction(FakeCursor(fetchone=[None])))
    resp = client.get("/api/v1/store")
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert set(body) == {
        "id",
        "name",
        "address",
        "phone",
        "license_no",
        "tax_id",
        "updated_at",
        "updated_by",
        "updated_by_name",
    }
    assert all(value is None for value in body.values())


# --- validation ------------------------------------------------------------------------


@pytest.mark.parametrize(
    "payload",
    [
        {},
        {"name": ""},
        {"name": "   "},
        {"name": None},
        {"id": str(uuid.uuid4())},
        {"name": "X", "updated_at": "2026-01-01T00:00:00Z"},
        {"name": "X", "updated_by": str(uuid.uuid4())},
        {"name": "X", "pharmacy_id": str(uuid.uuid4())},
    ],
    ids=[
        "empty-body",
        "name-empty",
        "name-blank",
        "name-null",
        "id-sent",
        "updated_at-sent",
        "updated_by-sent",
        "unknown-field",
    ],
)
def test_invalid_patch_returns_400(client, payload):
    login_as("owner")
    assert_error(client.patch("/api/v1/store", json=payload), 400, "VALIDATION_ERROR")


def test_first_save_requires_a_shop_name(client, monkeypatch):
    login_as("owner")
    cursor = MatchCursor([("store_profile", None)])
    monkeypatch.setattr(db, "get_transaction", fake_transaction(cursor))
    body = assert_error(
        client.patch("/api/v1/store", json={"phone": "021234567"}), 400, "VALIDATION_ERROR"
    )
    assert body["error"]["message"] == "กรุณากรอกชื่อร้านก่อนบันทึกครั้งแรก"
    assert cursor.writes() == []


def test_patch_without_real_change_returns_400(client, monkeypatch):
    login_as("owner")
    current = store_row()
    cursor = MatchCursor([("store_profile", current)])
    monkeypatch.setattr(db, "get_transaction", fake_transaction(cursor))
    assert_error(
        client.patch("/api/v1/store", json={"name": current["name"]}), 400, "VALIDATION_ERROR"
    )
    assert cursor.writes() == []


# --- service behaviour with a fake cursor ----------------------------------------------------


def test_first_save_inserts_the_row_and_audits_it(monkeypatch):
    inserted = store_row(name="ร้านยาสุขภาพดี")
    cursor = MatchCursor(
        [
            ("INSERT INTO public.store_profile", inserted),
            ("LEFT JOIN public.user_profiles", store_out_row()),
            ("audit_logs", None),
            ("store_profile", None),  # the SELECT ... FOR UPDATE: no row yet
        ]
    )
    monkeypatch.setattr(db, "get_transaction", fake_transaction(cursor))

    row = store_service.update_store_profile(
        StoreProfileUpdate(name="ร้านยาสุขภาพดี", phone="021234567"), ACTOR_ID
    )

    insert_sql, insert_params = cursor.queries("INSERT INTO public.store_profile")[0]
    assert insert_params[-1] == ACTOR_ID
    assert "ร้านยาสุขภาพดี" in insert_params and "021234567" in insert_params
    assert len(insert_params) == insert_sql.count("%s")

    _, audit_params = cursor.queries("audit_logs")[0]
    assert audit_params[0] == "store_profile"
    assert audit_params[1] == STORE_ID
    assert audit_params[2] == "insert"
    assert audit_params[3] is None
    assert audit_params[5] == ACTOR_ID
    assert row["updated_by_name"] == "ice boonak"


def test_later_save_updates_only_changed_fields_and_audits_old_and_new(monkeypatch):
    current = store_row()
    updated = store_row(phone="029999999")
    cursor = MatchCursor(
        [
            ("UPDATE public.store_profile", updated),
            ("LEFT JOIN public.user_profiles", store_out_row(phone="029999999")),
            ("audit_logs", None),
            ("store_profile", current),
        ]
    )
    monkeypatch.setattr(db, "get_transaction", fake_transaction(cursor))

    store_service.update_store_profile(
        StoreProfileUpdate(name=current["name"], phone="029999999"), ACTOR_ID
    )

    update_sql, update_params = cursor.queries("UPDATE public.store_profile")[0]
    assert '"phone" = %s' in update_sql
    assert '"name" = %s' not in update_sql  # unchanged, so not written
    assert update_params == ["029999999", ACTOR_ID, STORE_ID]

    _, audit_params = cursor.queries("audit_logs")[0]
    assert audit_params[2] == "update"
    assert audit_params[3].obj["phone"] == "021234567"
    assert audit_params[4].obj["phone"] == "029999999"


def test_writers_take_the_lock_before_reading_the_row(monkeypatch):
    """Two concurrent first-saves must not both try to insert the single row."""
    cursor = MatchCursor(
        [
            ("INSERT INTO public.store_profile", store_row()),
            ("LEFT JOIN public.user_profiles", store_out_row()),
            ("audit_logs", None),
            ("store_profile", None),
        ]
    )
    monkeypatch.setattr(db, "get_transaction", fake_transaction(cursor))
    store_service.update_store_profile(StoreProfileUpdate(name="ร้านยาสุขภาพดี"), ACTOR_ID)
    assert "pg_advisory_xact_lock" in cursor.executed[0][0]
    assert "FOR UPDATE" in cursor.executed[1][0]


def test_get_joins_the_editor_name(monkeypatch):
    cursor = MatchCursor([("LEFT JOIN public.user_profiles", store_out_row())])
    monkeypatch.setattr(db, "get_transaction", fake_transaction(cursor))
    assert store_service.get_store_profile()["updated_by_name"] == "ice boonak"
    assert cursor.writes() == []
