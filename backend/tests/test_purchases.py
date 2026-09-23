"""Unit tests for purchases / receiving confirm (task 3.7) and business date (D9, D10).

No real database: business "today", lookups and the cursor are faked.
"""

import uuid
from contextlib import contextmanager
from datetime import date, timedelta
from decimal import Decimal

import pytest
from fastapi.testclient import TestClient
from psycopg import sql
from psycopg.errors import UniqueViolation

from app import business_date, db
from app.auth import get_current_user
from app.errors import AppError
from app.main import app
from app.services import purchases as purchase_service
from tests.helpers import NOW, assert_error, make_user


class DuplicatePurchaseNo(UniqueViolation):
    @property
    def diag(self):
        from types import SimpleNamespace

        return SimpleNamespace(constraint_name=purchase_service.PURCHASE_NO_UNIQUE_CONSTRAINT)

TODAY = date(2026, 9, 17)
SUPPLIER_ID = uuid.uuid4()
MED_A = uuid.uuid4()
MED_B = uuid.uuid4()
INACTIVE_MED = uuid.uuid4()
PURCHASE_ID = uuid.uuid4()


# --- fakes -------------------------------------------------------------------------------------


class RecordingCursor:
    """Answers INSERT/UPDATE ... RETURNING with rows built from params; records everything."""

    def __init__(self, last_running=0):
        self.last_running = last_running
        self.executed: list[tuple[str, tuple]] = []
        self._next = None

    def execute(self, query, params=None):
        text = query if isinstance(query, str) else repr(query)
        self.executed.append((text, params))
        self._next = None
        if "INSERT INTO public.purchases" in text:
            supplier_id, purchase_date, invoice_no, discount, tax, total, created_by = params
            self._next = {
                "id": PURCHASE_ID, "store_id": None, "supplier_id": supplier_id, "invoice_id": None,
                "invoice_no": invoice_no, "purchase_no": None, "confirmed_at": None,
                "purchase_date": purchase_date, "discount_amount": discount, "tax_amount": tax,
                "total_amount": total, "status": "draft", "created_by": created_by, "created_at": NOW,
            }
        elif "INSERT INTO public.purchase_items" in text:
            keys = ("purchase_id", "medicine_id", "quantity_invoiced", "quantity_actual",
                    "unit_cost", "lot_number", "expiry_date", "subtotal")
            self._next = {"id": uuid.uuid4(), **dict(zip(keys, params)), "created_at": NOW}
        elif "INSERT INTO public.medicine_lots" in text:
            keys = ("medicine_id", "supplier_id", "purchase_item_id", "lot_number",
                    "quantity_received", "quantity_remaining", "cost_per_unit",
                    "expiry_date", "received_date")
            self._next = {"id": uuid.uuid4(), **dict(zip(keys, params)), "status": "active"}
        elif "last_running" in text:
            # D29: highest running number issued for this business day so far
            self._next = {"last_running": self.last_running}
        elif "SET status = %s, purchase_no" in text:
            self._next = {"id": params[2], "status": params[0], "purchase_no": params[1],
                          "confirmed_at": NOW}
        elif "UPDATE public.purchases" in text:
            self._next = {"id": params[-1], "status": "draft", "total_amount": params[5]}

    def fetchone(self):
        return self._next

    def fetchall(self):
        return []

    def queries(self, fragment):
        return [(q, p) for q, p in self.executed if fragment in q]


@pytest.fixture
def cursor(monkeypatch):
    cur = RecordingCursor()

    @contextmanager
    def fake_tx():
        yield cur

    monkeypatch.setattr(db, "get_transaction", fake_tx)
    monkeypatch.setattr(purchase_service, "fetch_business_today", lambda c: TODAY)
    monkeypatch.setattr(purchase_service, "_supplier_exists", lambda c, sid: sid == SUPPLIER_ID)
    monkeypatch.setattr(
        purchase_service,
        "_load_medicines",
        lambda c, ids: {
            MED_A: {"id": MED_A, "name": "A", "is_active": True},
            MED_B: {"id": MED_B, "name": "B", "is_active": True},
            INACTIVE_MED: {"id": INACTIVE_MED, "name": "X", "is_active": False},
        },
    )
    monkeypatch.setattr(purchase_service, "_fetch_detail", lambda c, pid: detail_row())
    return cur


@pytest.fixture
def client():
    yield TestClient(app)
    app.dependency_overrides.clear()


def login_as(role):
    user = make_user(role)
    app.dependency_overrides[get_current_user] = lambda: user
    return user


def item(**overrides):
    body = {
        "medicine_id": str(MED_A),
        "quantity_invoiced": 20,
        "quantity_actual": 18,
        "unit_cost": "12.50",
        "lot_number": "L1",
        "expiry_date": (TODAY + timedelta(days=20)).isoformat(),
    }
    body.update(overrides)
    return body


def purchase_body(items=None, **overrides):
    body = {
        "supplier_id": str(SUPPLIER_ID),
        "purchase_date": TODAY.isoformat(),
        "invoice_no": "INV-001",
        "discount_amount": "0.00",
        "tax_amount": "0.00",
        "items": items if items is not None else [item()],
    }
    body.update(overrides)
    return body


def detail_row(status="draft"):
    item_id = uuid.uuid4()
    return {
        "id": PURCHASE_ID, "supplier_id": SUPPLIER_ID, "supplier_name": "S",
        "purchase_date": TODAY, "items_subtotal": Decimal("250.00"),
        "discount_amount": Decimal("0.00"), "tax_amount": Decimal("0.00"),
        "total_amount": Decimal("250.00"), "status": status, "created_by": uuid.uuid4(),
        "created_by_name": "ผู้รับทดสอบ", "created_at": NOW,
        "purchase_no": None if status == "draft" else "R-690917-001",
        "invoice_no": "INV-001",
        "confirmed_at": None if status == "draft" else NOW,
        "items": [{
            "id": item_id, "medicine_id": MED_A, "medicine_name": "A", "unit": "กล่อง",
            "quantity_invoiced": 20,
            "quantity_actual": 18, "unit_cost": Decimal("12.5"), "lot_number": "L1",
            "expiry_date": TODAY + timedelta(days=20), "subtotal": Decimal("250"),
        }],
        "lots": [],
    }


def stored_purchase(status="draft", invoice_no="INV-001"):
    return {"id": PURCHASE_ID, "supplier_id": SUPPLIER_ID, "purchase_date": TODAY,
            "status": status, "invoice_no": invoice_no, "purchase_no": None,
            "confirmed_at": None}


def stored_item(**overrides):
    row = {
        "id": uuid.uuid4(), "purchase_id": PURCHASE_ID, "medicine_id": MED_A,
        "medicine_name": "A", "unit": "กล่อง",
        "quantity_invoiced": 20, "quantity_actual": None, "unit_cost": Decimal("12.50"),
        "lot_number": "L1", "expiry_date": TODAY + timedelta(days=20), "subtotal": Decimal("250.00"),
    }
    row.update(overrides)
    return row


def use_stored(monkeypatch, purchase, items):
    monkeypatch.setattr(purchase_service, "_lock_purchase", lambda c, pid: purchase)
    monkeypatch.setattr(purchase_service, "_load_items", lambda c, pid: items)


def use_confirm(monkeypatch, invoice_no="INV-001", last_running=0):
    """A draft ready to be confirmed, with a recording cursor in place."""
    recording = RecordingCursor(last_running=last_running)

    @contextmanager
    def tx():
        yield recording

    monkeypatch.setattr(db, "get_transaction", tx)
    monkeypatch.setattr(purchase_service, "fetch_business_today", lambda c: TODAY)
    monkeypatch.setattr(
        purchase_service, "_lock_purchase", lambda c, pid: stored_purchase(invoice_no=invoice_no)
    )
    monkeypatch.setattr(purchase_service, "_load_items", lambda c, pid: [stored_item(quantity_actual=20)])
    monkeypatch.setattr(purchase_service, "_validate_purchase", lambda *a, **k: None)
    return recording


# --- roles --------------------------------------------------------------------------------------


@pytest.mark.parametrize(
    "method,path,body",
    [
        ("post", "/api/v1/purchases", "body"),
        ("get", "/api/v1/purchases", None),
        ("get", f"/api/v1/purchases/{PURCHASE_ID}", None),
        ("put", f"/api/v1/purchases/{PURCHASE_ID}", "body"),
        ("post", f"/api/v1/purchases/{PURCHASE_ID}/confirm", None),
        ("delete", f"/api/v1/purchases/{PURCHASE_ID}", None),
    ],
    ids=["create", "list", "get", "put", "confirm", "delete"],
)
def test_staff_forbidden_on_all_purchase_endpoints(client, method, path, body):
    login_as("staff")
    kwargs = {"json": purchase_body()} if body else {}
    assert_error(getattr(client, method)(path, **kwargs), 403, "FORBIDDEN")


# --- create validation ----------------------------------------------------------------------------


def test_create_draft_returns_201_and_money_strings(client, cursor):
    user = login_as("pharmacist")
    resp = client.post("/api/v1/purchases", json=purchase_body())
    assert resp.status_code == 201, resp.text
    body = resp.json()
    for field in ("items_subtotal", "discount_amount", "tax_amount", "total_amount"):
        assert isinstance(body[field], str)
    assert body["total_amount"] == "250.00"
    assert body["items"][0]["unit_cost"] == "12.50" and body["items"][0]["subtotal"] == "250.00"
    purchase_insert = cursor.queries("INSERT INTO public.purchases")[0][1]
    assert purchase_insert[5] == Decimal("250.00") and purchase_insert[6] == user.id
    assert purchase_insert[2] == "INV-001"  # D28: เลขที่ใบส่งของ
    assert len(cursor.queries("audit_logs")) == 1


def test_supplier_not_found_returns_404(client, cursor):
    login_as("owner")
    body = assert_error(
        client.post("/api/v1/purchases", json=purchase_body(supplier_id=str(uuid.uuid4()))),
        404,
        "NOT_FOUND",
    )
    assert body["error"]["message"] == "ไม่พบข้อมูลผู้จำหน่าย"
    assert not cursor.queries("INSERT")


def test_empty_items_returns_400(client):
    login_as("owner")
    assert_error(client.post("/api/v1/purchases", json=purchase_body(items=[])), 400, "VALIDATION_ERROR")


def test_more_than_200_items_returns_400(client):
    login_as("owner")
    items = [item(lot_number=f"L{i}") for i in range(201)]
    assert_error(client.post("/api/v1/purchases", json=purchase_body(items=items)), 400, "VALIDATION_ERROR")


@pytest.mark.parametrize("days", [0, -1], ids=["exp-today", "exp-yesterday"])
def test_expired_or_expiring_today_returns_400(client, cursor, days):
    login_as("owner")
    exp = (TODAY + timedelta(days=days)).isoformat()
    body = assert_error(
        client.post("/api/v1/purchases", json=purchase_body(items=[item(expiry_date=exp)])),
        400,
        "VALIDATION_ERROR",
    )
    assert body["error"]["message"] == "ยาหมดอายุหรือหมดอายุวันนี้ ไม่สามารถรับเข้าได้"
    assert body["error"]["details"][0]["index"] == 0
    assert not cursor.queries("INSERT")


def test_expiry_tomorrow_is_accepted(client, cursor):
    login_as("owner")
    exp = (TODAY + timedelta(days=1)).isoformat()
    assert client.post("/api/v1/purchases", json=purchase_body(items=[item(expiry_date=exp)])).status_code == 201


def test_future_purchase_date_returns_400(client, cursor):
    login_as("owner")
    tomorrow = (TODAY + timedelta(days=1)).isoformat()
    assert_error(
        client.post("/api/v1/purchases", json=purchase_body(purchase_date=tomorrow)),
        400,
        "VALIDATION_ERROR",
    )


@pytest.mark.parametrize(
    "where,field",
    [("item", "subtotal"), ("header", "total_amount"), ("header", "status"), ("header", "created_by"), ("item", "id")],
)
def test_client_computed_fields_rejected(client, where, field):
    login_as("owner")
    body = purchase_body(items=[item(**({field: "1.00"} if where == "item" else {}))])
    if where == "header":
        body[field] = "1.00"
    assert_error(client.post("/api/v1/purchases", json=body), 400, "VALIDATION_ERROR")


def test_duplicate_items_return_400(client, cursor):
    login_as("owner")
    items = [item(lot_number="L1"), item(lot_number=" l1 ", quantity_actual=None)]
    body = assert_error(client.post("/api/v1/purchases", json=purchase_body(items=items)), 400, "VALIDATION_ERROR")
    assert body["error"]["details"] == [{"index": 1, "duplicate_of": 0, "lot_number": "l1"}]


def test_inactive_or_unknown_medicine_returns_400_with_index(client, cursor):
    login_as("owner")
    items = [item(), item(medicine_id=str(INACTIVE_MED), lot_number="L2"), item(medicine_id=str(uuid.uuid4()), lot_number="L3")]
    body = assert_error(client.post("/api/v1/purchases", json=purchase_body(items=items)), 400, "VALIDATION_ERROR")
    assert [d["index"] for d in body["error"]["details"]] == [1, 2]


@pytest.mark.parametrize(
    "overrides",
    [
        {"quantity_invoiced": 0, "quantity_actual": 0},
        {"quantity_invoiced": 0, "quantity_actual": None},
        {"quantity_invoiced": -1},
        {"quantity_actual": -1},
        {"unit_cost": "-1.00"},
        {"unit_cost": "1.005"},
        {"lot_number": "   "},
    ],
    ids=["both-zero", "invoiced-zero-no-actual", "invoiced-negative", "actual-negative", "cost-negative", "cost-3-decimals", "lot-blank"],
)
def test_invalid_item_fields_return_400(client, overrides):
    login_as("owner")
    assert_error(client.post("/api/v1/purchases", json=purchase_body(items=[item(**overrides)])), 400, "VALIDATION_ERROR")


def test_negative_total_returns_400(client, cursor):
    login_as("owner")
    assert_error(
        client.post("/api/v1/purchases", json=purchase_body(discount_amount="300.00")),
        400,
        "VALIDATION_ERROR",
    )
    assert not cursor.queries("INSERT")


def test_compute_totals_and_half_up_rounding():
    items = [
        {"quantity_invoiced": 20, "unit_cost": Decimal("12.50")},
        {"quantity_invoiced": 3, "unit_cost": Decimal("0.335")},  # 1.005 -> 1.01 (HALF_UP)
        {"quantity_invoiced": 0, "unit_cost": Decimal("9.99")},
    ]
    subtotals, items_subtotal, total = purchase_service.compute_totals(items, Decimal("1.00"), Decimal("0.50"))
    assert subtotals == [Decimal("250.00"), Decimal("1.01"), Decimal("0.00")]
    assert items_subtotal == Decimal("251.01")
    assert total == Decimal("250.51")
    assert purchase_service.money(Decimal("2.345")) == Decimal("2.35")
    assert purchase_service.money(Decimal("2.344")) == Decimal("2.34")


def test_api_total_uses_backend_calculation(client, cursor):
    login_as("owner")
    items = [item(), item(medicine_id=str(MED_B), lot_number="L2", quantity_invoiced=10, quantity_actual=None, unit_cost="8.25")]
    client.post("/api/v1/purchases", json=purchase_body(items=items, discount_amount="1.00", tax_amount="0.50"))
    params = cursor.queries("INSERT INTO public.purchases")[0][1]
    assert params[5] == Decimal("332.00")  # 250.00 + 82.50 - 1.00 + 0.50
    subtotals = [p[7] for _, p in cursor.queries("INSERT INTO public.purchase_items")]
    assert subtotals == [Decimal("250.00"), Decimal("82.50")]


def test_list_date_range_invalid_returns_400(client):
    login_as("owner")
    assert_error(
        client.get("/api/v1/purchases?date_from=2026-09-10&date_to=2026-09-01"), 400, "VALIDATION_ERROR"
    )
    assert_error(client.get("/api/v1/purchases?status=bogus"), 400, "VALIDATION_ERROR")
    assert_error(client.get("/api/v1/purchases?limit=201"), 400, "VALIDATION_ERROR")


# --- state rules --------------------------------------------------------------------------------------


@pytest.mark.parametrize("status", ["confirmed", "discrepancy"])
def test_put_on_confirmed_purchase_returns_409(client, cursor, monkeypatch, status):
    login_as("owner")
    use_stored(monkeypatch, stored_purchase(status), [stored_item()])
    assert_error(client.put(f"/api/v1/purchases/{PURCHASE_ID}", json=purchase_body()), 409, "INVALID_STATE")
    assert not cursor.queries("UPDATE") and not cursor.queries("DELETE")


def test_delete_on_confirmed_purchase_returns_409(client, cursor, monkeypatch):
    login_as("owner")
    use_stored(monkeypatch, stored_purchase("confirmed"), [stored_item()])
    assert_error(client.delete(f"/api/v1/purchases/{PURCHASE_ID}"), 409, "INVALID_STATE")
    assert not cursor.queries("DELETE")


def test_confirm_twice_returns_409(client, cursor, monkeypatch):
    login_as("owner")
    use_stored(monkeypatch, stored_purchase("confirmed"), [stored_item()])
    assert_error(client.post(f"/api/v1/purchases/{PURCHASE_ID}/confirm"), 409, "INVALID_STATE")
    assert not cursor.queries("INSERT")


def test_missing_purchase_returns_404(client, cursor, monkeypatch):
    login_as("owner")
    use_stored(monkeypatch, None, [])
    assert_error(client.post(f"/api/v1/purchases/{PURCHASE_ID}/confirm"), 404, "NOT_FOUND")
    assert_error(client.delete(f"/api/v1/purchases/{PURCHASE_ID}"), 404, "NOT_FOUND")
    assert_error(client.put(f"/api/v1/purchases/{PURCHASE_ID}", json=purchase_body()), 404, "NOT_FOUND")


def test_put_replaces_items_in_one_transaction(client, cursor, monkeypatch):
    login_as("owner")
    use_stored(monkeypatch, stored_purchase("draft"), [stored_item()])
    resp = client.put(f"/api/v1/purchases/{PURCHASE_ID}", json=purchase_body(items=[item(unit_cost="13.00")]))
    assert resp.status_code == 200, resp.text
    texts = [q for q, _ in cursor.executed]
    order = [next(i for i, q in enumerate(texts) if frag in q) for frag in
             ("UPDATE public.purchases", "DELETE FROM public.purchase_items", "INSERT INTO public.purchase_items", "audit_logs")]
    assert order == sorted(order)
    audit = cursor.queries("audit_logs")[0][1]
    assert audit[2] == "update" and audit[3].obj["items"][0]["unit_cost"] == Decimal("12.50")


def test_delete_draft_removes_items_then_purchase_with_audit(client, cursor, monkeypatch):
    login_as("owner")
    use_stored(monkeypatch, stored_purchase("draft"), [stored_item()])
    resp = client.delete(f"/api/v1/purchases/{PURCHASE_ID}")
    assert resp.status_code == 200 and resp.json() == {"id": str(PURCHASE_ID), "deleted": True}
    texts = [q for q, _ in cursor.executed]
    assert texts.index(next(q for q in texts if "DELETE FROM public.purchase_items" in q)) < texts.index(
        next(q for q in texts if "DELETE FROM public.purchases" in q)
    )
    audit = cursor.queries("audit_logs")[0][1]
    assert audit[2] == "delete" and audit[4] is None
    assert audit[3].obj["purchase"]["id"] == PURCHASE_ID and len(audit[3].obj["items"]) == 1


# --- confirm ------------------------------------------------------------------------------------------


def test_confirm_without_discrepancy_is_confirmed(client, cursor, monkeypatch):
    user = login_as("pharmacist")
    item_row = stored_item(quantity_invoiced=10, quantity_actual=None)
    use_stored(monkeypatch, stored_purchase("draft"), [item_row])
    resp = client.post(f"/api/v1/purchases/{PURCHASE_ID}/confirm")
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["status"] == "confirmed" and body["discrepancies"] == []
    assert len(body["lots"]) == 1 and body["lots"][0]["quantity"] == 10

    lot_params = cursor.queries("INSERT INTO public.medicine_lots")[0][1]
    assert lot_params[2] == item_row["id"]            # purchase_item_id
    assert lot_params[4] == lot_params[5] == 10       # received == remaining
    assert lot_params[6] == Decimal("12.50")          # cost_per_unit = unit_cost
    assert lot_params[8] == TODAY                     # received_date = business today (D9)
    tx_params = cursor.queries("INSERT INTO public.inventory_transactions")[0][1]
    assert tx_params[1:] == (10, 10, PURCHASE_ID, user.id)  # change, after, reference_id, created_by
    assert "'purchase', %s, 0, %s, 'purchase'" in cursor.queries("INSERT INTO public.inventory_transactions")[0][0]
    update_params = cursor.queries("SET status = %s, purchase_no")[0][1]
    # D29/D30: number and timestamp are set in the same statement
    assert update_params == ("confirmed", "R-690917-001", PURCHASE_ID)


def test_confirm_with_actual_different_is_discrepancy(client, cursor, monkeypatch):
    login_as("owner")
    items = [
        stored_item(quantity_invoiced=20, quantity_actual=18, lot_number="L1"),
        stored_item(medicine_id=MED_B, quantity_invoiced=10, quantity_actual=None, lot_number="L2"),
    ]
    use_stored(monkeypatch, stored_purchase("draft"), items)
    body = client.post(f"/api/v1/purchases/{PURCHASE_ID}/confirm").json()
    assert body["status"] == "discrepancy"
    assert body["discrepancies"] == [
        {"medicine_id": str(MED_A), "lot_number": "L1", "invoiced": 20, "actual": 18}
    ]
    assert sorted(lot["quantity"] for lot in body["lots"]) == [10, 18]
    assert len(cursor.queries("INSERT INTO public.inventory_transactions")) == 2


def test_confirm_quantity_zero_creates_no_lot(client, cursor, monkeypatch):
    login_as("owner")
    items = [
        stored_item(quantity_invoiced=5, quantity_actual=0, lot_number="L0"),
        stored_item(medicine_id=MED_B, quantity_invoiced=4, quantity_actual=None, lot_number="L4"),
    ]
    use_stored(monkeypatch, stored_purchase("draft"), items)
    body = client.post(f"/api/v1/purchases/{PURCHASE_ID}/confirm").json()
    assert body["status"] == "discrepancy"
    assert [lot["lot_number"] for lot in body["lots"]] == ["L4"]
    assert len(cursor.queries("INSERT INTO public.medicine_lots")) == 1
    assert len(cursor.queries("INSERT INTO public.inventory_transactions")) == 1


def test_confirm_revalidates_expiry_and_creates_nothing(client, cursor, monkeypatch):
    login_as("owner")
    items = [stored_item(lot_number="OK"), stored_item(medicine_id=MED_B, lot_number="OLD", expiry_date=TODAY)]
    use_stored(monkeypatch, stored_purchase("draft"), items)
    body = assert_error(client.post(f"/api/v1/purchases/{PURCHASE_ID}/confirm"), 400, "VALIDATION_ERROR")
    assert body["error"]["details"][0]["index"] == 1
    assert not cursor.queries("INSERT") and not cursor.queries("UPDATE")


def test_confirm_writes_audit_in_same_transaction(client, cursor, monkeypatch):
    login_as("owner")
    use_stored(monkeypatch, stored_purchase("draft"), [stored_item()])
    client.post(f"/api/v1/purchases/{PURCHASE_ID}/confirm")
    audit = cursor.queries("audit_logs")
    assert len(audit) == 1 and audit[0][1][2] == "update" and audit[0][1][6] == "confirm"


# --- business date (D9) --------------------------------------------------------------------------------


def _render(composed):
    return composed.as_string()


def test_business_today_sql_uses_store_timezone():
    text = _render(business_date.business_today_sql())
    assert text == "((now()) AT TIME ZONE 'Asia/Bangkok')::date"
    assert "CURRENT_DATE" not in text.upper()


def test_business_today_sql_accepts_fixed_instant():
    text = _render(business_date.business_today_sql(sql.Literal("2026-09-17 18:00:00+00")))
    assert text == "(('2026-09-17 18:00:00+00') AT TIME ZONE 'Asia/Bangkok')::date"


def test_medicine_available_quantity_uses_business_today_and_excludes_today():
    from app.services import medicines as medicine_service

    text = _render(medicine_service._select_medicine())
    assert "l.expiry_date > ((now()) AT TIME ZONE 'Asia/Bangkok')::date" in text
    assert "CURRENT_DATE" not in text.upper()


# --- D28 / D29 / D30 ------------------------------------------------------------------------


@pytest.mark.parametrize(
    "business_date,expected",
    [
        (date(2026, 9, 18), "R-690918"),
        (date(2027, 6, 30), "R-700630"),
        (date(2057, 3, 4), "R-000304"),
    ],
)
def test_purchase_no_prefix_uses_buddhist_year(business_date, expected):
    assert purchase_service.purchase_no_prefix(business_date) == expected


@pytest.mark.parametrize(
    "last_running,expected",
    [(0, "R-690917-001"), (9, "R-690917-010"), (998, "R-690917-999"), (999, "R-690917-1000")],
)
def test_purchase_running_number_pads_and_widens(last_running, expected):
    cursor = RecordingCursor(last_running=last_running)
    assert purchase_service.next_purchase_no(cursor, TODAY) == expected


def test_confirm_without_an_invoice_number_is_refused(client, monkeypatch):
    """D28: a draft may be saved without it, but nothing is received without it."""
    login_as("owner")
    cursor = use_confirm(monkeypatch, invoice_no=None)
    resp = client.post(f"/api/v1/purchases/{PURCHASE_ID}/confirm")
    assert resp.status_code == 400
    assert resp.json()["error"]["code"] == "VALIDATION_ERROR"
    assert resp.json()["error"]["message"] == "กรุณากรอกเลขที่ใบส่งของก่อนยืนยันรับสินค้า"
    assert cursor.queries("INSERT INTO public.medicine_lots") == []  # nothing received


@pytest.mark.parametrize("invoice_no", ["", "   "])
def test_blank_invoice_number_counts_as_missing(client, monkeypatch, invoice_no):
    login_as("owner")
    use_confirm(monkeypatch, invoice_no=invoice_no)
    assert client.post(f"/api/v1/purchases/{PURCHASE_ID}/confirm").status_code == 400


def test_confirm_issues_the_number_and_stamps_the_time(client, monkeypatch):
    """D29/D30: both are written in the same statement as the status change."""
    login_as("owner")
    cursor = use_confirm(monkeypatch)
    resp = client.post(f"/api/v1/purchases/{PURCHASE_ID}/confirm")
    assert resp.status_code == 200, resp.text
    assert resp.json()["purchase_no"] == "R-690917-001"
    assert resp.json()["confirmed_at"] is not None

    texts = [text for text, _ in cursor.executed]
    lookup = next(i for i, text in enumerate(texts) if "last_running" in text)
    update = next(i for i, text in enumerate(texts) if "SET status = %s, purchase_no" in text)
    assert lookup < update  # read first, then written, one transaction
    assert "confirmed_at = now()" in texts[update]


def test_a_draft_carries_no_number(client, monkeypatch, cursor):
    """D29: creating a draft must not burn a number — the column stays null."""
    login_as("owner")
    resp = client.post("/api/v1/purchases", json=purchase_body())
    assert resp.status_code == 201, resp.text
    assert resp.json()["purchase_no"] is None
    assert resp.json()["confirmed_at"] is None
    insert_sql = cursor.queries("INSERT INTO public.purchases")[0][0]
    assert "purchase_no" not in insert_sql


def test_clash_on_the_number_retries_the_whole_confirm(monkeypatch):
    attempts = {"count": 0}

    def flaky(purchase_id, actor_id):
        attempts["count"] += 1
        if attempts["count"] < 3:
            raise DuplicatePurchaseNo("duplicate key")
        return {"purchase_id": purchase_id, "purchase_no": "R-690917-003"}

    monkeypatch.setattr(purchase_service, "_confirm_purchase_once", flaky)
    result = purchase_service.confirm_purchase(PURCHASE_ID, uuid.uuid4())
    assert attempts["count"] == 3
    assert result["purchase_no"] == "R-690917-003"


def test_giving_up_after_five_clashes_raises(monkeypatch):
    attempts = {"count": 0}

    def always(purchase_id, actor_id):
        attempts["count"] += 1
        raise DuplicatePurchaseNo("duplicate key")

    monkeypatch.setattr(purchase_service, "_confirm_purchase_once", always)
    with pytest.raises(AppError) as error:
        purchase_service.confirm_purchase(PURCHASE_ID, uuid.uuid4())
    assert attempts["count"] == purchase_service.MAX_PURCHASE_NO_ATTEMPTS == 5
    assert error.value.code == "INVALID_STATE" and error.value.http_status == 409


def test_created_by_name_is_joined_from_created_by(client, monkeypatch):
    """D30: the receiver is whoever booked it in, not whoever is reading."""
    login_as("owner")
    monkeypatch.setattr(purchase_service, "get_purchase", lambda pid: detail_row("confirmed"))
    body = client.get(f"/api/v1/purchases/{PURCHASE_ID}").json()
    assert body["created_by_name"] == "ผู้รับทดสอบ"
    assert body["purchase_no"] == "R-690917-001"
    assert body["invoice_no"] == "INV-001"
