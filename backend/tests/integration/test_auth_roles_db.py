"""Auth, roles and cost visibility on the real test database (spec 11 #2, #3; D11)."""

import uuid

import pytest

from tests.integration.conftest import api, headers, insert_lot, insert_medicine, make_token

pytestmark = pytest.mark.db

COST_FIELDS = ("cost_per_unit", "unit_cost", "stock_value", "available_value", "expired_value", "total_value", "sellable_value")


# --- spec 11 #2: 401 / 403 ------------------------------------------------------------------


def test_no_token_returns_401(client):
    assert client.get("/api/v1/me").status_code == 401


def test_broken_token_returns_401(client):
    assert client.get("/api/v1/me", headers={"Authorization": "Bearer not-a-token"}).status_code == 401


def test_expired_token_returns_401(client):
    token = make_token("owner", expires_in=-120)
    assert client.get("/api/v1/me", headers={"Authorization": f"Bearer {token}"}).status_code == 401


def test_wrong_audience_and_issuer_return_401(client):
    for token in (make_token("owner", audience="anon"), make_token("owner", issuer="https://evil.example.com/auth/v1")):
        assert client.get("/api/v1/me", headers={"Authorization": f"Bearer {token}"}).status_code == 401


def test_token_for_user_without_profile_returns_403(client):
    resp = api(client, "get", "/api/v1/me", "noprofile")
    assert resp.status_code == 403
    assert resp.json()["error"]["message"] == "บัญชีนี้ยังไม่ได้รับสิทธิ์ใช้งานระบบ"


def test_token_for_inactive_user_returns_403(client):
    resp = api(client, "get", "/api/v1/me", "inactive")
    assert resp.status_code == 403
    assert resp.json()["error"]["message"] == "บัญชีนี้ถูกปิดการใช้งาน"


@pytest.mark.parametrize(
    "method,path,body",
    [
        ("post", "/api/v1/medicines", {"name": "X"}),
        ("get", "/api/v1/suppliers", None),
        ("post", "/api/v1/purchases", {"supplier_id": str(uuid.uuid4()), "purchase_date": "2026-09-17", "items": []}),
        ("get", "/api/v1/reports/inventory-value", None),
        ("get", "/api/v1/audit-logs", None),
    ],
    ids=["create-medicine", "list-suppliers", "create-purchase", "inventory-value", "audit-logs"],
)
def test_staff_forbidden_on_manager_endpoints(client, method, path, body):
    kwargs = {"json": body} if body is not None else {}
    assert api(client, method, path, "staff", **kwargs).status_code == 403


def test_pharmacist_forbidden_on_audit_logs(client):
    assert api(client, "get", "/api/v1/audit-logs", "pharmacist").status_code == 403


def test_pharmacist_forbidden_on_inventory_value(client):
    """D20: hiding the page is not the guard — the API itself refuses pharmacist."""
    resp = api(client, "get", "/api/v1/reports/inventory-value", "pharmacist")
    assert resp.status_code == 403
    assert resp.json()["error"]["code"] == "FORBIDDEN"


def test_owner_can_view_inventory_value(client):
    resp = api(client, "get", "/api/v1/reports/inventory-value", "owner")
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert set(body) == {"total_value", "sellable_value", "expired_value", "by_medicine", "by_category"}


def test_each_role_sees_own_profile(client):
    for role in ("owner", "pharmacist", "staff"):
        resp = api(client, "get", "/api/v1/me", role)
        assert resp.status_code == 200 and resp.json()["role"] == role


# --- spec 11 #3: staff never sees cost ---------------------------------------------------------


def test_staff_sees_no_cost_or_value_fields_anywhere(client):
    medicine_id = insert_medicine("Staff visibility med", reorder_point=100)
    lot = insert_lot(medicine_id, lot_number="SV-1", quantity=5, exp_offset_days=10)
    expired_medicine = insert_medicine("Staff expired med", barcode=None)
    insert_lot(expired_medicine, lot_number="SV-EXP", quantity=2, exp_offset_days=-1)

    sale = api(client, "post", "/api/v1/sales", "staff", json={"items": [{"medicine_id": str(medicine_id), "quantity": 1}]})
    assert sale.status_code == 201, sale.text

    paths = [
        "/api/v1/medicines",
        f"/api/v1/medicines/{medicine_id}",
        f"/api/v1/medicines/{medicine_id}/lots?include_inactive=true",
        f"/api/v1/lots/{lot['id']}",
        f"/api/v1/medicines/{medicine_id}/fefo-preview?quantity=1",
        "/api/v1/reports/stock",
        "/api/v1/reports/expiring?days=365",
        "/api/v1/reports/expired",
        "/api/v1/reports/low-stock",
        "/api/v1/sales",
        f"/api/v1/sales/{sale.json()['id']}",
    ]
    for path in paths:
        resp = api(client, "get", path, "staff")
        assert resp.status_code == 200, (path, resp.text)
        for field in COST_FIELDS:
            assert field not in resp.text, (path, field)


def test_manager_sees_cost_fields(client):
    medicine_id = insert_medicine("Manager visibility med")
    insert_lot(medicine_id, lot_number="MV-1", quantity=5, exp_offset_days=10, cost="12.34")
    for role in ("owner", "pharmacist"):
        resp = api(client, "get", f"/api/v1/medicines/{medicine_id}/lots", role)
        assert resp.status_code == 200
        assert resp.json()["items"][0]["cost_per_unit"] == "12.34"


# --- D11: staff price and discount control -------------------------------------------------------


def test_staff_cannot_change_price_or_give_discount(client):
    medicine_id = insert_medicine("D11 med", selling_price="50.00")
    insert_lot(medicine_id, lot_number="D11-1", quantity=10, exp_offset_days=30)

    changed = api(client, "post", "/api/v1/sales", "staff",
                  json={"items": [{"medicine_id": str(medicine_id), "quantity": 1, "unit_price": "40.00"}]})
    assert changed.status_code == 403
    assert changed.json()["error"]["message"] == "คุณไม่มีสิทธิ์เปลี่ยนราคาขาย"

    discounted = api(client, "post", "/api/v1/sales", "staff",
                     json={"discount_amount": "5.00", "items": [{"medicine_id": str(medicine_id), "quantity": 1}]})
    assert discounted.status_code == 403
    assert discounted.json()["error"]["message"] == "คุณไม่มีสิทธิ์ให้ส่วนลด"

    same_price = api(client, "post", "/api/v1/sales", "staff",
                     json={"items": [{"medicine_id": str(medicine_id), "quantity": 1, "unit_price": "50.00"}]})
    assert same_price.status_code == 201, same_price.text


def test_pharmacist_may_change_price_and_audit_records_override(client):
    medicine_id = insert_medicine("D11 override med", selling_price="50.00")
    insert_lot(medicine_id, lot_number="D11-2", quantity=10, exp_offset_days=30)
    resp = api(client, "post", "/api/v1/sales", "pharmacist",
               json={"discount_amount": "1.00", "items": [{"medicine_id": str(medicine_id), "quantity": 2, "unit_price": "45.00"}]})
    assert resp.status_code == 201, resp.text
    assert resp.json()["total_amount"] == "89.00"

    logs = api(client, "get", f"/api/v1/audit-logs?table_name=sales&record_id={resp.json()['id']}", "owner")
    assert logs.status_code == 200
    assert logs.json()["items"][0]["new_value"]["price_override"] is True
