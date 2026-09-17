"""Phase 3 gate: a client must not reach the tables directly through the Supabase Data API.

RLS is on with no policies, so PostgREST returns no rows and refuses writes.
Runs against the test project only (keys come from backend/.env.test).
"""

import httpx
import pytest

from app import db
from tests.integration.conftest import TEST_CONFIG, insert_lot, insert_medicine, insert_supplier

pytestmark = pytest.mark.db

ALL_TABLES = (
    "medicines",
    "suppliers",
    "invoices",
    "purchases",
    "purchase_items",
    "medicine_lots",
    "sales",
    "sale_items",
    "inventory_transactions",
    "audit_logs",
    "user_profiles",
)


@pytest.fixture(scope="module")
def rest():
    key = (TEST_CONFIG or {}).get("publishable_key", "")
    if not key:
        pytest.skip("TEST_SUPABASE_PUBLISHABLE_KEY not set")
    base = TEST_CONFIG["supabase_url"].rstrip("/")
    with httpx.Client(
        base_url=f"{base}/rest/v1",
        headers={"apikey": key, "Authorization": f"Bearer {key}"},
        timeout=20,
    ) as client:
        yield client


def test_data_exists_but_rest_api_returns_nothing(client, rest):
    medicine_id = insert_medicine("Gate med", barcode="GATE-1", selling_price="10.00")
    insert_supplier("Gate supplier")
    insert_lot(medicine_id, lot_number="GATE-L1", quantity=5, exp_offset_days=30)

    blocked = {}
    for table in ALL_TABLES:
        resp = rest.get(f"/{table}", params={"select": "*"})
        rows = resp.json() if resp.status_code == 200 and resp.content else []
        row_count = len(rows) if isinstance(rows, list) else 0
        blocked[table] = (resp.status_code, row_count)
        assert row_count == 0, f"{table} leaked {row_count} rows through the Data API"
    print("\nGET /rest/v1 per table (status, rows):", blocked)


def test_rest_api_write_is_refused(rest):
    medicine_id = insert_medicine("Gate write med", barcode="GATE-W1", selling_price="10.00")

    insert_resp = rest.post("/medicines", json={"name": "Injected by client"})
    assert insert_resp.status_code >= 400, f"client insert succeeded: {insert_resp.status_code}"

    # PostgREST answers 204 with an empty body when RLS lets no row through.
    patch_resp = rest.patch("/medicines", params={"id": f"eq.{medicine_id}"}, json={"name": "hijacked"})
    patched = patch_resp.json() if patch_resp.content else []
    assert patch_resp.status_code >= 400 or patched in ([], None)

    delete_resp = rest.delete("/medicines", params={"id": f"eq.{medicine_id}"})
    assert delete_resp.status_code >= 400 or (delete_resp.json() if delete_resp.content else []) in ([], None)

    # The database is unchanged.
    with db.get_transaction() as cur:
        cur.execute("SELECT name FROM public.medicines WHERE id = %s", (medicine_id,))
        assert cur.fetchone()["name"] == "Gate write med"
        cur.execute("SELECT count(*) AS n FROM public.medicines WHERE name = 'Injected by client'")
        assert cur.fetchone()["n"] == 0
