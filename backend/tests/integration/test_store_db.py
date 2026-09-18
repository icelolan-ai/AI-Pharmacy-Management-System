"""Store profile (ข้อมูลร้าน) and medicines.unit on the real test database.

Covers migration 004 (medicines.unit defaults to 'กล่อง') and migration 005
(the single store_profile row: read by anyone, written by the owner only).
"""

import pytest

from app import db
from tests.integration.conftest import OWNER_ID, api, count_rows, insert_medicine

pytestmark = pytest.mark.db


def fetch_store_row():
    with db.get_transaction() as cur:
        cur.execute("SELECT * FROM public.store_profile LIMIT 1")
        return cur.fetchone()


# --- migration 004: หน่วยนับ ---------------------------------------------------------------------


def test_medicine_without_unit_gets_the_default(client):
    resp = api(client, "post", "/api/v1/medicines", "owner", json={"name": "Unit default med"})
    assert resp.status_code == 201, resp.text
    assert resp.json()["unit"] == "กล่อง"


def test_medicine_unit_is_stored_and_returned(client):
    created = api(client, "post", "/api/v1/medicines", "owner",
                  json={"name": "Syrup med", "unit": "ขวด"})
    assert created.status_code == 201, created.text
    medicine_id = created.json()["id"]
    assert created.json()["unit"] == "ขวด"

    assert api(client, "get", f"/api/v1/medicines/{medicine_id}", "staff").json()["unit"] == "ขวด"

    patched = api(client, "patch", f"/api/v1/medicines/{medicine_id}", "owner", json={"unit": "แผง"})
    assert patched.status_code == 200, patched.text
    assert patched.json()["unit"] == "แผง"


def test_reports_carry_the_unit(client):
    insert_medicine("Report unit med")
    with db.get_transaction() as cur:
        cur.execute("UPDATE public.medicines SET unit = 'ซอง'")

    stock = api(client, "get", "/api/v1/reports/stock", "staff")
    assert stock.status_code == 200, stock.text
    assert stock.json()["items"][0]["unit"] == "ซอง"


# --- migration 005: store profile ----------------------------------------------------------------


@pytest.mark.parametrize("role", ["owner", "pharmacist", "staff"])
def test_every_role_can_read_an_unsaved_profile(client, role):
    resp = api(client, "get", "/api/v1/store", role)
    assert resp.status_code == 200, resp.text  # never 404
    assert resp.json()["name"] is None
    assert count_rows("store_profile") == 0  # reading creates nothing


@pytest.mark.parametrize("role", ["pharmacist", "staff"])
def test_non_owner_cannot_edit_the_profile(client, role):
    resp = api(client, "patch", "/api/v1/store", role, json={"name": "ร้านของคนอื่น"})
    assert resp.status_code == 403
    assert resp.json()["error"]["code"] == "FORBIDDEN"
    assert count_rows("store_profile") == 0
    assert count_rows("audit_logs") == 0


def test_owner_first_save_creates_the_row_and_audits_it(client):
    missing_name = api(client, "patch", "/api/v1/store", "owner", json={"phone": "021234567"})
    assert missing_name.status_code == 400
    assert count_rows("store_profile") == 0

    resp = api(client, "patch", "/api/v1/store", "owner",
               json={"name": "ร้านยาสุขภาพดี", "phone": "021234567", "license_no": "ขย.1/2569"})
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["name"] == "ร้านยาสุขภาพดี"
    assert body["updated_by"] == str(OWNER_ID)
    assert body["updated_at"] is not None
    assert body["address"] is None

    assert count_rows("store_profile") == 1
    assert count_rows(
        "audit_logs", "WHERE table_name = %s AND action = %s", ("store_profile", "insert")
    ) == 1


def test_owner_second_save_updates_the_same_row(client):
    api(client, "patch", "/api/v1/store", "owner", json={"name": "ร้านเดิม"})
    first = fetch_store_row()

    resp = api(client, "patch", "/api/v1/store", "owner",
               json={"name": "ร้านใหม่", "address": "123 ถนนสุขุมวิท"})
    assert resp.status_code == 200, resp.text
    assert resp.json()["name"] == "ร้านใหม่"

    second = fetch_store_row()
    assert count_rows("store_profile") == 1  # still one row
    assert second["id"] == first["id"]
    assert second["updated_at"] > first["updated_at"]  # the trigger stamps it

    assert count_rows(
        "audit_logs", "WHERE table_name = %s AND action = %s", ("store_profile", "update")
    ) == 1
    with db.get_transaction() as cur:
        cur.execute(
            "SELECT old_value, new_value FROM public.audit_logs"
            " WHERE table_name = 'store_profile' AND action = 'update'"
        )
        entry = cur.fetchone()
    assert entry["old_value"]["name"] == "ร้านเดิม"
    assert entry["new_value"]["name"] == "ร้านใหม่"


def test_saved_profile_is_visible_to_staff_with_the_editor_name(client):
    api(client, "patch", "/api/v1/store", "owner", json={"name": "ร้านยาสุขภาพดี"})
    body = api(client, "get", "/api/v1/store", "staff").json()
    assert body["name"] == "ร้านยาสุขภาพดี"
    assert body["updated_by"] == str(OWNER_ID)
    assert body["updated_by_name"]  # joined from user_profiles


def test_resending_the_same_values_changes_nothing(client):
    api(client, "patch", "/api/v1/store", "owner", json={"name": "ร้านยาสุขภาพดี"})
    before = fetch_store_row()

    resp = api(client, "patch", "/api/v1/store", "owner", json={"name": "ร้านยาสุขภาพดี"})
    assert resp.status_code == 400
    assert resp.json()["error"]["code"] == "VALIDATION_ERROR"

    assert fetch_store_row()["updated_at"] == before["updated_at"]
    assert count_rows("audit_logs", "WHERE table_name = %s", ("store_profile",)) == 1
