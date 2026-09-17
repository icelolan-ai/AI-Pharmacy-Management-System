"""Unit tests for FEFO lot selection/allocation and fefo-preview (task 3.8). No real database."""

import uuid
from contextlib import contextmanager
from datetime import date, timedelta

import pytest
from fastapi.testclient import TestClient

from app import db
from app.auth import get_current_user
from app.main import app
from app.services import fefo
from tests.helpers import assert_error, make_user

TODAY = date(2026, 9, 17)
MED = uuid.uuid4()


def lot(lot_number, exp_days, remaining, *, received_days_ago=10, status="active", lot_id=None):
    return {
        "id": lot_id or uuid.uuid4(),
        "medicine_id": MED,
        "lot_number": lot_number,
        "quantity_remaining": remaining,
        "expiry_date": TODAY + timedelta(days=exp_days),
        "received_date": TODAY - timedelta(days=received_days_ago),
        "status": status,
    }


def numbers(plan):
    return [(a.lot_number, a.quantity) for a in plan.allocations]


# --- allocation rules ----------------------------------------------------------------------------


def test_picks_nearest_expiry_first_among_three_lots():
    lots = [lot("L-200", 200, 10), lot("L-20", 20, 10), lot("L-90", 90, 10)]
    plan = fefo.allocate(MED, lots, 5, TODAY)
    assert numbers(plan) == [("L-20", 5)]
    assert plan.sufficient and plan.available == 30


def test_same_expiry_older_received_first():
    lots = [lot("NEW", 30, 10, received_days_ago=1), lot("OLD", 30, 10, received_days_ago=40)]
    assert numbers(fefo.allocate(MED, lots, 3, TODAY)) == [("OLD", 3)]


def test_same_expiry_and_received_date_uses_id_order():
    low, high = uuid.UUID(int=1), uuid.UUID(int=2)
    lots = [lot("HIGH", 30, 10, lot_id=high), lot("LOW", 30, 10, lot_id=low)]
    assert numbers(fefo.allocate(MED, lots, 3, TODAY)) == [("LOW", 3)]


def test_spans_lots_when_first_is_not_enough():
    lots = [lot("L1", 20, 18), lot("L2", 200, 10)]
    plan = fefo.allocate(MED, lots, 20, TODAY)
    assert numbers(plan) == [("L1", 18), ("L2", 2)]
    assert [a.remaining_before for a in plan.allocations] == [18, 10]


@pytest.mark.parametrize("exp_days", [0, -1], ids=["exp-today", "exp-yesterday"])
def test_lot_expiring_today_or_earlier_is_not_sellable(exp_days):
    lots = [lot("EXPIRING", exp_days, 50), lot("GOOD", 30, 5)]
    plan = fefo.allocate(MED, lots, 5, TODAY)
    assert numbers(plan) == [("GOOD", 5)]
    assert plan.available == 5


@pytest.mark.parametrize(
    "bad_lot",
    [lot("DEPLETED", 10, 5, status="depleted"), lot("DAMAGED", 10, 5, status="damaged"),
     lot("EXPIRED-STATUS", 10, 5, status="expired"), lot("EMPTY", 10, 0)],
    ids=["depleted", "damaged", "expired-status", "remaining-zero"],
)
def test_non_active_or_empty_lots_are_not_sellable(bad_lot):
    plan = fefo.allocate(MED, [bad_lot, lot("GOOD", 30, 5)], 5, TODAY)
    assert numbers(plan) == [("GOOD", 5)]


def test_insufficient_reports_requested_and_available():
    plan = fefo.allocate(MED, [lot("L1", 20, 3), lot("L2", 40, 4)], 9, TODAY)
    assert not plan.sufficient
    assert (plan.requested, plan.available) == (9, 7)


def test_sellable_lots_sql_filters_orders_and_locks():
    locked = fefo.sellable_lots_sql(lock=True).as_string()
    for fragment in (
        "status = 'active'",
        "quantity_remaining > 0",
        "expiry_date > ((now()) AT TIME ZONE 'Asia/Bangkok')::date",
        "ORDER BY expiry_date ASC, received_date ASC, id ASC",
    ):
        assert fragment in locked
    assert locked.rstrip().endswith("FOR UPDATE")
    assert "FOR UPDATE" not in fefo.sellable_lots_sql(lock=False).as_string()
    assert "CURRENT_DATE" not in locked.upper()


# --- preview endpoint ----------------------------------------------------------------------------


class PreviewCursor:
    def __init__(self, exists=True, lots=()):
        self.exists, self.lots, self.executed, self._last = exists, list(lots), [], ""

    def execute(self, query, params=None):
        self._last = query if isinstance(query, str) else query.as_string()
        self.executed.append(self._last)

    def fetchone(self):
        if "FROM public.medicines" in self._last:
            return {"found": 1} if self.exists else None
        if "AS today" in self._last:
            return {"today": TODAY}
        return None

    def fetchall(self):
        return self.lots


@pytest.fixture
def client():
    yield TestClient(app)
    app.dependency_overrides.clear()


def use_cursor(monkeypatch, cursor):
    @contextmanager
    def tx():
        yield cursor

    monkeypatch.setattr(db, "get_transaction", tx)


def test_preview_sufficient_for_staff(client, monkeypatch):
    app.dependency_overrides[get_current_user] = lambda: make_user("staff")
    cursor = PreviewCursor(lots=[lot("L1", 20, 18), lot("L2", 200, 10)])
    use_cursor(monkeypatch, cursor)
    resp = client.get(f"/api/v1/medicines/{MED}/fefo-preview?quantity=20")
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["requested"] == 20 and body["available"] == 28 and body["sufficient"] is True
    assert [(a["lot_number"], a["quantity"]) for a in body["allocations"]] == [("L1", 18), ("L2", 2)]
    assert set(body["allocations"][0]) == {"lot_id", "lot_number", "expiry_date", "quantity"}
    assert "cost" not in resp.text
    assert not any("FOR UPDATE" in q for q in cursor.executed)
    assert not any(q.lstrip().upper().startswith(("INSERT", "UPDATE", "DELETE")) for q in cursor.executed)


def test_preview_insufficient_is_200_with_sufficient_false(client, monkeypatch):
    app.dependency_overrides[get_current_user] = lambda: make_user("pharmacist")
    use_cursor(monkeypatch, PreviewCursor(lots=[lot("L1", 20, 8)]))
    body = client.get(f"/api/v1/medicines/{MED}/fefo-preview?quantity=9").json()
    assert body["sufficient"] is False and body["available"] == 8
    assert [(a["lot_number"], a["quantity"]) for a in body["allocations"]] == [("L1", 8)]


def test_preview_unknown_medicine_returns_404(client, monkeypatch):
    app.dependency_overrides[get_current_user] = lambda: make_user("owner")
    use_cursor(monkeypatch, PreviewCursor(exists=False))
    assert_error(client.get(f"/api/v1/medicines/{MED}/fefo-preview?quantity=1"), 404, "NOT_FOUND")


@pytest.mark.parametrize("quantity", ["0", "-1", "1.5", "abc", "100001"])
def test_preview_invalid_quantity_returns_400(client, quantity):
    app.dependency_overrides[get_current_user] = lambda: make_user("owner")
    assert_error(
        client.get(f"/api/v1/medicines/{MED}/fefo-preview?quantity={quantity}"), 400, "VALIDATION_ERROR"
    )


def test_preview_missing_quantity_returns_400(client):
    app.dependency_overrides[get_current_user] = lambda: make_user("owner")
    assert_error(client.get(f"/api/v1/medicines/{MED}/fefo-preview"), 400, "VALIDATION_ERROR")


def test_preview_requires_login(client):
    assert_error(client.get(f"/api/v1/medicines/{MED}/fefo-preview?quantity=1"), 401, "UNAUTHENTICATED")
