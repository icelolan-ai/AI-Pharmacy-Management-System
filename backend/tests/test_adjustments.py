"""Unit tests for stock adjustments (task 3.9, spec 10.3). No real database."""

import uuid
from datetime import date, timedelta
from decimal import Decimal

import pytest
from fastapi.testclient import TestClient

from app import db
from app.auth import get_current_user
from app.main import app
from app.services import lots as lot_service
from tests.helpers import MatchCursor, assert_error, fake_transaction, make_user

TODAY = date(2026, 9, 17)
LOT = uuid.uuid4()
TX_ID = uuid.uuid4()


@pytest.fixture
def client():
    yield TestClient(app)
    app.dependency_overrides.clear()


def login_as(role):
    user = make_user(role)
    app.dependency_overrides[get_current_user] = lambda: user
    return user


def use_lot(monkeypatch, *, remaining=3, status="active", exp_days=20):
    stored = {
        "id": LOT, "medicine_id": uuid.uuid4(), "lot_number": "L2", "quantity_received": 10,
        "quantity_remaining": remaining, "expiry_date": TODAY + timedelta(days=exp_days),
        "received_date": TODAY, "status": status, "cost_per_unit": Decimal("8.25"), "supplier_id": None,
    }
    state = {}

    def after_update(params):
        state["remaining"], state["status"] = params[0], params[1]

    def view(params):
        return {
            **stored, "medicine_name": "TEST", "quantity_remaining": state.get("remaining", remaining),
            "status": state.get("status", status), "days_remaining": exp_days,
            "sellable": state.get("status", status) == "active" and state.get("remaining", remaining) > 0 and exp_days > 0,
        }

    cursor = MatchCursor([
        ("AS today", {"today": TODAY}),
        ("FOR UPDATE", stored),
        ("UPDATE public.medicine_lots", lambda p: after_update(p)),
        ("INSERT INTO public.inventory_transactions", {"id": TX_ID}),
        ("audit_logs", None),
        ("FROM public.medicine_lots l", view),
    ])
    monkeypatch.setattr(db, "get_transaction", fake_transaction(cursor))
    return cursor


def adjust(client, **body):
    payload = {"transaction_type": "adjustment", "quantity_change": -1, "reason": "นับสต็อกใหม่"}
    payload.update(body)
    return client.post(f"/api/v1/lots/{LOT}/adjustments", json=payload)


# --- roles & validation ----------------------------------------------------------------------------


def test_staff_cannot_adjust(client):
    login_as("staff")
    assert_error(adjust(client), 403, "FORBIDDEN")


@pytest.mark.parametrize(
    "body",
    [
        {"reason": None}, {"reason": ""}, {"reason": "   "}, {"reason": "ก" * 501},
        {"quantity_change": 0}, {"quantity_change": 100001}, {"quantity_change": -100001},
        {"quantity_change": 1.5}, {"transaction_type": "damage", "quantity_change": 1},
        {"transaction_type": "expired", "quantity_change": 2}, {"transaction_type": "sale"},
        {"transaction_type": "purchase"}, {"lot_id": str(LOT)},
    ],
    ids=["reason-null", "reason-empty", "reason-blank", "reason-501", "change-zero", "change-too-big",
         "change-too-small", "change-decimal", "damage-positive", "expired-positive", "type-sale",
         "type-purchase", "extra-field"],
)
def test_invalid_adjustment_returns_400(client, body):
    login_as("owner")
    payload = {"transaction_type": "adjustment", "quantity_change": -1, "reason": "x"}
    payload.update(body)
    if body.get("reason", "x") is None:
        payload.pop("reason")
    assert_error(client.post(f"/api/v1/lots/{LOT}/adjustments", json=payload), 400, "VALIDATION_ERROR")


def test_reason_with_500_chars_is_accepted(client, monkeypatch):
    login_as("owner")
    use_lot(monkeypatch)
    assert adjust(client, reason="ก" * 500).status_code == 201


def test_result_below_zero_returns_400_and_writes_nothing(client, monkeypatch):
    login_as("owner")
    cursor = use_lot(monkeypatch, remaining=3)
    body = assert_error(adjust(client, transaction_type="damage", quantity_change=-10), 400, "VALIDATION_ERROR")
    assert body["error"]["message"] == "จำนวนคงเหลือไม่พอสำหรับการปรับ"
    assert body["error"]["details"] == {"remaining": 3, "change": -10}
    assert cursor.writes() == []


@pytest.mark.parametrize("exp_days", [0, -5], ids=["exp-today", "exp-past"])
def test_increase_on_expired_lot_returns_400(client, monkeypatch, exp_days):
    login_as("owner")
    cursor = use_lot(monkeypatch, exp_days=exp_days)
    body = assert_error(adjust(client, transaction_type="correction", quantity_change=1), 400, "VALIDATION_ERROR")
    assert body["error"]["message"] == "ไม่สามารถเพิ่มจำนวนให้ Lot ที่หมดอายุแล้ว"
    assert cursor.writes() == []


@pytest.mark.parametrize("status", ["damaged", "expired"])
def test_increase_on_damaged_or_expired_status_returns_409(client, monkeypatch, status):
    login_as("pharmacist")
    cursor = use_lot(monkeypatch, remaining=0, status=status)
    assert_error(adjust(client, transaction_type="correction", quantity_change=1), 409, "INVALID_STATE")
    assert cursor.writes() == []


def test_unknown_lot_returns_404(client, monkeypatch):
    login_as("owner")
    cursor = MatchCursor([("AS today", {"today": TODAY}), ("FOR UPDATE", None)])
    monkeypatch.setattr(db, "get_transaction", fake_transaction(cursor))
    assert_error(adjust(client), 404, "NOT_FOUND")


# --- status rules ------------------------------------------------------------------------------------


def test_increase_on_depleted_lot_reactivates(client, monkeypatch):
    login_as("owner")
    cursor = use_lot(monkeypatch, remaining=0, status="depleted")
    resp = adjust(client, transaction_type="correction", quantity_change=1)
    assert resp.status_code == 201, resp.text
    assert cursor.queries("UPDATE public.medicine_lots")[0][1] == (1, "active", LOT)
    assert resp.json()["status"] == "active" and resp.json()["quantity_remaining"] == 1


@pytest.mark.parametrize(
    "transaction_type,expected",
    [("damage", "damaged"), ("expired", "expired"), ("adjustment", "depleted"),
     ("correction", "depleted"), ("return", "depleted")],
)
def test_reaching_zero_sets_status_by_type(client, monkeypatch, transaction_type, expected):
    login_as("owner")
    cursor = use_lot(monkeypatch, remaining=2)
    assert adjust(client, transaction_type=transaction_type, quantity_change=-2).status_code == 201
    assert cursor.queries("UPDATE public.medicine_lots")[0][1] == (0, expected, LOT)


def test_next_status_keeps_active_when_not_zero():
    assert lot_service.next_status("active", "damage", 5, 3) == "active"
    assert lot_service.next_status("active", "correction", 5, 6) == "active"
    assert lot_service.next_status("depleted", "return", 0, 4) == "active"


# --- transaction, audit, response ------------------------------------------------------------------------


def test_transaction_before_change_after_and_audit_reason(client, monkeypatch):
    user = login_as("pharmacist")
    cursor = use_lot(monkeypatch, remaining=3)
    resp = adjust(client, transaction_type="damage", quantity_change=-1, reason="  กล่องแตก  ")
    assert resp.status_code == 201, resp.text

    tx_query, tx = cursor.queries("INSERT INTO public.inventory_transactions")[0]
    lot_id, tx_type, change, before, after, reference_id, notes, created_by = tx
    assert (tx_type, change, before, after) == ("damage", -1, 3, 2)
    assert before + change == after
    assert "'adjustment'" in tx_query and reference_id == LOT
    assert notes == "กล่องแตก" and created_by == user.id

    audit = cursor.queries("audit_logs")[0][1]
    assert audit[0] == "medicine_lots" and audit[1] == LOT and audit[2] == "update"
    assert audit[3].obj == {"quantity_remaining": 3, "status": "active"}
    assert audit[4].obj == {"quantity_remaining": 2, "status": "active"}
    assert audit[5] == user.id and audit[6] == "กล่องแตก"

    body = resp.json()
    assert body["transaction_id"] == str(TX_ID)
    assert body["quantity_remaining"] == 2 and body["cost_per_unit"] == "8.25"


# --- D23: quantity_before guards against a concurrent change -------------------------------------


def test_matching_quantity_before_is_accepted(client, monkeypatch):
    """The screen saw 3 and the lot still holds 3, so the adjustment goes through."""
    login_as("owner")
    cursor = use_lot(monkeypatch, remaining=3)
    resp = adjust(client, quantity_change=-1, quantity_before=3)
    assert resp.status_code == 201, resp.text
    assert resp.json()["quantity_remaining"] == 2
    sent = cursor.queries("INSERT INTO public.inventory_transactions")[0][1]
    assert sent[3] == 3 and sent[4] == 2  # quantity_before / quantity_after from the DB


def test_stale_quantity_before_returns_409_and_writes_nothing(client, monkeypatch):
    """Someone sold from the lot while the dialog was open: 3 on screen, 2 in the database."""
    login_as("owner")
    cursor = use_lot(monkeypatch, remaining=2)
    body = assert_error(adjust(client, quantity_change=-1, quantity_before=3), 409, "INVALID_STATE")
    assert body["error"]["message"] == "จำนวนคงเหลือเปลี่ยนไป กรุณาตรวจนับใหม่"
    assert body["error"]["details"] == {"quantity_before": 3, "quantity_remaining": 2}
    assert cursor.writes() == []


def test_omitting_quantity_before_keeps_the_old_behaviour(client, monkeypatch):
    """Optional field: a client that does not send it still adjusts normally."""
    login_as("owner")
    use_lot(monkeypatch, remaining=3)
    resp = adjust(client, quantity_change=-1)
    assert resp.status_code == 201, resp.text
    assert resp.json()["quantity_remaining"] == 2


def test_negative_quantity_before_returns_400(client):
    login_as("owner")
    assert_error(adjust(client, quantity_before=-1), 400, "VALIDATION_ERROR")
