"""Unit tests for FEFO sales and D11 price control (task 3.8). No real database."""

import uuid
from contextlib import contextmanager
from datetime import date, timedelta
from decimal import Decimal

import pytest
from fastapi.testclient import TestClient

from app import db
from app.auth import get_current_user
from app.main import app
from app.services import sales as sale_service
from tests.helpers import NOW, assert_error, make_user

TODAY = date(2026, 9, 17)
MED_A = uuid.UUID("00000000-0000-0000-0000-00000000000a")
MED_B = uuid.UUID("00000000-0000-0000-0000-00000000000b")
MED_NO_PRICE = uuid.uuid4()
MED_INACTIVE = uuid.uuid4()
SALE_ID = uuid.uuid4()

MEDICINES = {
    MED_A: {"id": MED_A, "name": "A", "selling_price": Decimal("95.00"), "is_active": True},
    MED_B: {"id": MED_B, "name": "B", "selling_price": Decimal("20.00"), "is_active": True},
    MED_NO_PRICE: {"id": MED_NO_PRICE, "name": "NP", "selling_price": None, "is_active": True},
    MED_INACTIVE: {"id": MED_INACTIVE, "name": "X", "selling_price": Decimal("1.00"), "is_active": False},
}


def lot(medicine_id, lot_number, exp_days, remaining, received_days_ago=10):
    return {
        "id": uuid.uuid4(), "medicine_id": medicine_id, "lot_number": lot_number,
        "quantity_remaining": remaining, "expiry_date": TODAY + timedelta(days=exp_days),
        "received_date": TODAY - timedelta(days=received_days_ago), "status": "active",
    }


class SalesCursor:
    def __init__(self, lots_by_medicine):
        self.lots_by_medicine = lots_by_medicine
        self.lots_by_id = {l["id"]: l for lots in lots_by_medicine.values() for l in lots}
        self.executed: list[tuple[str, tuple]] = []
        self.sale_items: list[dict] = []
        self._one = None
        self._all = []

    def execute(self, query, params=None):
        text = query if isinstance(query, str) else query.as_string()
        self.executed.append((text, params))
        self._one, self._all = None, []
        if "AS today" in text:
            self._one = {"today": TODAY}
        elif "selling_price, is_active FROM public.medicines" in text:
            self._all = [MEDICINES[m] for m in params[0] if m in MEDICINES]
        elif "FROM public.medicine_lots" in text:
            self._all = self.lots_by_medicine.get(params[0], [])
        elif "INSERT INTO public.sales" in text:
            self._one = {"id": SALE_ID, "sale_date": NOW, "discount_amount": params[0],
                         "tax_amount": Decimal("0"), "total_amount": params[1], "created_by": params[2]}
        elif "INSERT INTO public.sale_items" in text:
            keys = ("sale_id", "medicine_id", "medicine_lot_id", "quantity", "unit_price", "subtotal")
            row = {"id": uuid.uuid4(), **dict(zip(keys, params))}
            self.sale_items.append(row)
            self._one = row
        elif "UPDATE public.medicine_lots" in text:
            qty, _, lot_id, before = params
            after = before - qty
            self._one = {"quantity_remaining": after, "status": "depleted" if after == 0 else "active"}

    def fetchone(self):
        return self._one

    def fetchall(self):
        return self._all

    def writes(self):
        return [(q, p) for q, p in self.executed if q.lstrip().upper().startswith(("INSERT", "UPDATE", "DELETE"))]

    def queries(self, fragment):
        return [(q, p) for q, p in self.executed if fragment in q]


@pytest.fixture
def client():
    yield TestClient(app)
    app.dependency_overrides.clear()


def login_as(role):
    user = make_user(role)
    app.dependency_overrides[get_current_user] = lambda: user
    return user


def use_db(monkeypatch, lots_by_medicine):
    cursor = SalesCursor(lots_by_medicine)

    @contextmanager
    def tx():
        yield cursor

    monkeypatch.setattr(db, "get_transaction", tx)

    def fake_fetch(cur, sale_id):
        return {
            "id": SALE_ID, "sale_date": NOW, "discount_amount": Decimal("0.00"),
            "tax_amount": Decimal("0"), "total_amount": Decimal("0.00"),
            "items": [
                {"medicine_id": i["medicine_id"], "medicine_name": MEDICINES[i["medicine_id"]]["name"],
                 "lot_id": i["medicine_lot_id"], "lot_number": cursor.lots_by_id[i["medicine_lot_id"]]["lot_number"],
                 "expiry_date": cursor.lots_by_id[i["medicine_lot_id"]]["expiry_date"],
                 "quantity": i["quantity"], "unit_price": i["unit_price"], "subtotal": i["subtotal"]}
                for i in cursor.sale_items
            ],
        }

    monkeypatch.setattr(sale_service, "_fetch_sale", fake_fetch)
    return cursor


def sale(*items, discount="0.00"):
    return {"discount_amount": discount, "items": list(items)}


def audit_new_value(cursor):
    return cursor.queries("audit_logs")[0][1][4].obj


# --- FEFO cutting ------------------------------------------------------------------------------------


def test_sale_spans_two_lots_creates_two_sale_items_and_transactions(client, monkeypatch):
    user = login_as("staff")
    l1, l2 = lot(MED_A, "L1", 20, 13), lot(MED_A, "L2", 200, 10)
    cursor = use_db(monkeypatch, {MED_A: [l2, l1]})
    resp = client.post("/api/v1/sales", json=sale({"medicine_id": str(MED_A), "quantity": 15}))
    assert resp.status_code == 201, resp.text

    items = resp.json()["items"]
    assert [(i["lot_number"], i["quantity"]) for i in items] == [("L1", 13), ("L2", 2)]
    assert all(i["unit_price"] == "95.00" for i in items)
    assert [i["subtotal"] for i in items] == ["1235.00", "190.00"]

    sale_insert = cursor.queries("INSERT INTO public.sales")[0][1]
    assert sale_insert == (Decimal("0.00"), Decimal("1425.00"), user.id)

    txs = [p for _, p in cursor.queries("INSERT INTO public.inventory_transactions")]
    assert [(t[1], t[2], t[3]) for t in txs] == [(-13, 13, 0), (-2, 10, 8)]
    for lot_id, change, before, after, reference_id, created_by in txs:
        assert before + change == after
        assert reference_id == SALE_ID and created_by == user.id
    assert all("'sale', %s, %s, %s, 'sale'" in q for q, _ in cursor.queries("INSERT INTO public.inventory_transactions"))

    updates = cursor.queries("UPDATE public.medicine_lots")
    assert [p[0] for _, p in updates] == [13, 2]
    assert "status = CASE WHEN quantity_remaining - %s = 0 THEN 'depleted'" in updates[0][0]
    assert [i["lot_status_after"] for i in audit_new_value(cursor)["items"]] == ["depleted", "active"]


def test_sale_picks_nearest_expiry_lot(client, monkeypatch):
    login_as("owner")
    near, far = lot(MED_A, "NEAR", 20, 18), lot(MED_A, "FAR", 200, 10)
    cursor = use_db(monkeypatch, {MED_A: [far, near]})
    client.post("/api/v1/sales", json=sale({"medicine_id": str(MED_A), "quantity": 5}))
    assert [p[2] for _, p in cursor.queries("INSERT INTO public.sale_items")] == [near["id"]]


def test_expired_and_expiring_today_lots_are_not_sold(client, monkeypatch):
    login_as("owner")
    lots = [lot(MED_A, "TODAY", 0, 50), lot(MED_A, "YESTERDAY", -1, 50), lot(MED_A, "OK", 30, 3)]
    cursor = use_db(monkeypatch, {MED_A: lots})
    body = assert_error(
        client.post("/api/v1/sales", json=sale({"medicine_id": str(MED_A), "quantity": 4})),
        409, "INSUFFICIENT_STOCK",
    )
    assert body["error"]["details"] == [{"medicine_id": str(MED_A), "requested": 4, "available": 3}]
    assert cursor.writes() == []


def test_insufficient_stock_returns_409_and_writes_nothing(client, monkeypatch):
    login_as("pharmacist")
    cursor = use_db(monkeypatch, {MED_A: [lot(MED_A, "L2", 200, 8)]})
    body = assert_error(
        client.post("/api/v1/sales", json=sale({"medicine_id": str(MED_A), "quantity": 9})),
        409, "INSUFFICIENT_STOCK",
    )
    assert body["error"]["message"] == "จำนวนยาในสต็อกไม่เพียงพอ"
    assert body["error"]["details"] == [{"medicine_id": str(MED_A), "requested": 9, "available": 8}]
    assert cursor.writes() == []


def test_multi_medicine_one_short_rejects_whole_bill(client, monkeypatch):
    login_as("owner")
    cursor = use_db(monkeypatch, {MED_A: [lot(MED_A, "A1", 30, 100)], MED_B: [lot(MED_B, "B1", 30, 1)]})
    body = assert_error(
        client.post("/api/v1/sales", json=sale(
            {"medicine_id": str(MED_B), "quantity": 2}, {"medicine_id": str(MED_A), "quantity": 5}
        )),
        409, "INSUFFICIENT_STOCK",
    )
    assert body["error"]["details"] == [{"medicine_id": str(MED_B), "requested": 2, "available": 1}]
    assert cursor.writes() == []
    locked = [p[0] for q, p in cursor.queries("FROM public.medicine_lots") if "FOR UPDATE" in q]
    assert locked == sorted([MED_A, MED_B])  # fixed lock order prevents deadlocks


# --- D11 price control --------------------------------------------------------------------------------


def test_staff_selling_price_default_and_equal_price_allowed(client, monkeypatch):
    login_as("staff")
    use_db(monkeypatch, {MED_A: [lot(MED_A, "L1", 30, 50)]})
    assert client.post("/api/v1/sales", json=sale({"medicine_id": str(MED_A), "quantity": 1})).status_code == 201
    assert client.post(
        "/api/v1/sales", json=sale({"medicine_id": str(MED_A), "quantity": 1, "unit_price": "95"})
    ).status_code == 201


def test_staff_changing_price_returns_403(client, monkeypatch):
    login_as("staff")
    cursor = use_db(monkeypatch, {MED_A: [lot(MED_A, "L1", 30, 50)]})
    body = assert_error(
        client.post("/api/v1/sales", json=sale({"medicine_id": str(MED_A), "quantity": 1, "unit_price": "90.00"})),
        403, "FORBIDDEN",
    )
    assert body["error"]["message"] == "คุณไม่มีสิทธิ์เปลี่ยนราคาขาย"
    assert cursor.writes() == []


def test_staff_discount_returns_403(client, monkeypatch):
    login_as("staff")
    cursor = use_db(monkeypatch, {MED_A: [lot(MED_A, "L1", 30, 50)]})
    body = assert_error(
        client.post("/api/v1/sales", json=sale({"medicine_id": str(MED_A), "quantity": 1}, discount="1.00")),
        403, "FORBIDDEN",
    )
    assert body["error"]["message"] == "คุณไม่มีสิทธิ์ให้ส่วนลด"
    assert cursor.writes() == []


def test_pharmacist_price_override_is_allowed_and_audited(client, monkeypatch):
    login_as("pharmacist")
    cursor = use_db(monkeypatch, {MED_A: [lot(MED_A, "L1", 30, 50)]})
    resp = client.post(
        "/api/v1/sales",
        json=sale({"medicine_id": str(MED_A), "quantity": 2, "unit_price": "90.00"}, discount="5.00"),
    )
    assert resp.status_code == 201, resp.text
    audit = audit_new_value(cursor)
    assert audit["price_override"] is True
    assert audit["items"][0]["price_override"] is True
    assert audit["items"][0]["selling_price"] == Decimal("95.00") and audit["items"][0]["unit_price"] == Decimal("90.00")
    assert audit["discount_amount"] == Decimal("5.00")
    assert cursor.queries("INSERT INTO public.sales")[0][1][:2] == (Decimal("5.00"), Decimal("175.00"))


def test_no_override_audit_flag_false(client, monkeypatch):
    login_as("owner")
    cursor = use_db(monkeypatch, {MED_A: [lot(MED_A, "L1", 30, 50)]})
    client.post("/api/v1/sales", json=sale({"medicine_id": str(MED_A), "quantity": 1}))
    assert audit_new_value(cursor)["price_override"] is False


def test_staff_price_on_medicine_without_selling_price_returns_403(client, monkeypatch):
    login_as("staff")
    use_db(monkeypatch, {MED_NO_PRICE: [lot(MED_NO_PRICE, "L1", 30, 50)]})
    assert_error(
        client.post("/api/v1/sales", json=sale({"medicine_id": str(MED_NO_PRICE), "quantity": 1, "unit_price": "10.00"})),
        403, "FORBIDDEN",
    )


# --- validation ------------------------------------------------------------------------------------------


def test_no_selling_price_and_no_unit_price_returns_400(client, monkeypatch):
    login_as("owner")
    cursor = use_db(monkeypatch, {MED_NO_PRICE: [lot(MED_NO_PRICE, "L1", 30, 50)]})
    body = assert_error(
        client.post("/api/v1/sales", json=sale({"medicine_id": str(MED_NO_PRICE), "quantity": 1})),
        400, "VALIDATION_ERROR",
    )
    assert body["error"]["message"] == "ยังไม่ได้ตั้งราคาขาย"
    assert cursor.writes() == []


def test_duplicate_medicine_in_bill_returns_400(client, monkeypatch):
    login_as("owner")
    use_db(monkeypatch, {MED_A: [lot(MED_A, "L1", 30, 50)]})
    body = assert_error(
        client.post("/api/v1/sales", json=sale(
            {"medicine_id": str(MED_A), "quantity": 1}, {"medicine_id": str(MED_A), "quantity": 2}
        )),
        400, "VALIDATION_ERROR",
    )
    assert body["error"]["details"][0]["index"] == 1


def test_unknown_or_inactive_medicine_returns_400(client, monkeypatch):
    login_as("owner")
    use_db(monkeypatch, {})
    body = assert_error(
        client.post("/api/v1/sales", json=sale(
            {"medicine_id": str(MED_INACTIVE), "quantity": 1}, {"medicine_id": str(uuid.uuid4()), "quantity": 1}
        )),
        400, "VALIDATION_ERROR",
    )
    assert [d["index"] for d in body["error"]["details"]] == [0, 1]


@pytest.mark.parametrize("field", ["subtotal", "total_amount", "tax_amount", "sale_date", "created_by"])
def test_client_supplied_computed_fields_return_400(client, field):
    login_as("owner")
    body = sale({"medicine_id": str(MED_A), "quantity": 1})
    body[field] = "1.00"
    assert_error(client.post("/api/v1/sales", json=body), 400, "VALIDATION_ERROR")


def test_item_subtotal_field_returns_400(client):
    login_as("owner")
    assert_error(
        client.post("/api/v1/sales", json=sale({"medicine_id": str(MED_A), "quantity": 1, "subtotal": "1.00"})),
        400, "VALIDATION_ERROR",
    )


def test_negative_total_returns_400(client, monkeypatch):
    login_as("owner")
    cursor = use_db(monkeypatch, {MED_A: [lot(MED_A, "L1", 30, 50)]})
    assert_error(
        client.post("/api/v1/sales", json=sale({"medicine_id": str(MED_A), "quantity": 1}, discount="95.01")),
        400, "VALIDATION_ERROR",
    )
    assert cursor.writes() == []


@pytest.mark.parametrize(
    "item",
    [
        {"quantity": 0}, {"quantity": -1}, {"quantity": 1.5}, {"quantity": "abc"},
        {"quantity": 1, "unit_price": "-1.00"}, {"quantity": 1, "unit_price": "9.999"},
    ],
    ids=["qty-zero", "qty-negative", "qty-decimal", "qty-text", "price-negative", "price-3-decimals"],
)
def test_invalid_item_values_return_400(client, item):
    login_as("owner")
    assert_error(client.post("/api/v1/sales", json=sale({"medicine_id": str(MED_A), **item})), 400, "VALIDATION_ERROR")


def test_items_empty_or_over_100_returns_400(client):
    login_as("owner")
    assert_error(client.post("/api/v1/sales", json=sale()), 400, "VALIDATION_ERROR")
    many = [{"medicine_id": str(uuid.uuid4()), "quantity": 1} for _ in range(101)]
    assert_error(client.post("/api/v1/sales", json=sale(*many)), 400, "VALIDATION_ERROR")


# --- responses, reads -----------------------------------------------------------------------------------


def test_money_is_string_and_no_cost_fields(client, monkeypatch):
    login_as("staff")
    use_db(monkeypatch, {MED_A: [lot(MED_A, "L1", 30, 50)]})
    resp = client.post("/api/v1/sales", json=sale({"medicine_id": str(MED_A), "quantity": 2}))
    body = resp.json()
    for field in ("discount_amount", "tax_amount", "total_amount"):
        assert isinstance(body[field], str)
    assert isinstance(body["items"][0]["unit_price"], str) and isinstance(body["items"][0]["subtotal"], str)
    for forbidden in ("cost", "cost_per_unit", "unit_cost", "stock_value"):
        assert forbidden not in resp.text
    assert set(body["items"][0]) == {
        "medicine_id", "medicine_name", "lot_id", "lot_number", "expiry_date", "quantity", "unit_price", "subtotal"
    }


def test_get_unknown_sale_returns_404(client, monkeypatch):
    login_as("staff")

    class Empty:
        def execute(self, q, p=None):
            pass

        def fetchone(self):
            return None

    @contextmanager
    def tx():
        yield Empty()

    monkeypatch.setattr(db, "get_transaction", tx)
    assert_error(client.get(f"/api/v1/sales/{uuid.uuid4()}"), 404, "NOT_FOUND")


def test_list_dates_are_store_local_days(client, monkeypatch):
    login_as("staff")
    captured = []

    class ListCursor:
        def execute(self, q, p=None):
            captured.append((q.as_string() if not isinstance(q, str) else q, p))

        def fetchone(self):
            return {"total": 0}

        def fetchall(self):
            return []

    @contextmanager
    def tx():
        yield ListCursor()

    monkeypatch.setattr(db, "get_transaction", tx)
    resp = client.get("/api/v1/sales?date_from=2026-09-17&date_to=2026-09-17")
    assert resp.status_code == 200
    query, params = captured[1]
    assert "s.sale_date >= ((%s::date)::timestamp AT TIME ZONE 'Asia/Bangkok')" in query
    assert "s.sale_date < ((%s::date)::timestamp AT TIME ZONE 'Asia/Bangkok')" in query
    assert "ORDER BY s.sale_date DESC" in query
    assert params[:2] == [date(2026, 9, 17), date(2026, 9, 18)]  # [start of 17th, start of 18th) Bangkok


def test_list_invalid_date_range_returns_400(client):
    login_as("staff")
    assert_error(client.get("/api/v1/sales?date_from=2026-09-18&date_to=2026-09-17"), 400, "VALIDATION_ERROR")


def test_sales_require_login(client):
    assert_error(client.post("/api/v1/sales", json=sale({"medicine_id": str(MED_A), "quantity": 1})), 401, "UNAUTHENTICATED")
    assert_error(client.get("/api/v1/sales"), 401, "UNAUTHENTICATED")
