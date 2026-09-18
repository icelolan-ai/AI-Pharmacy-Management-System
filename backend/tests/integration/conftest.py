"""Integration test setup: real test database, real app, self-signed tokens.

The guard in tests/db_guard.py runs first: these tests only ever touch the
ai-pharmacy-test project. Business tables are truncated between tests;
auth.users and user_profiles (created by Chat A) are never touched.
"""

import time
import uuid
from types import SimpleNamespace

import jwt
import pytest
from cryptography.hazmat.primitives.asymmetric import ec
from fastapi.testclient import TestClient
from pydantic import SecretStr

from app import auth, db
from app.business_date import fetch_business_today
from app.config import get_settings
from app.main import app
from tests.db_guard import ensure_test_database

TEST_CONFIG = ensure_test_database()
if TEST_CONFIG is None:  # not configured -> skip the whole integration folder
    collect_ignore_glob = ["*"]

KID = "integration-test-kid"
PRIVATE_KEY = ec.generate_private_key(ec.SECP256R1())
PUBLIC_KEY = PRIVATE_KEY.public_key()

OWNER_ID = uuid.UUID("11111111-1111-4111-8111-111111111111")
PHARMACIST_ID = uuid.UUID("22222222-2222-4222-8222-222222222222")
STAFF_ID = uuid.UUID("33333333-3333-4333-8333-333333333333")
NO_PROFILE_ID = uuid.UUID("44444444-4444-4444-8444-444444444444")
INACTIVE_ID = uuid.UUID("55555555-5555-4555-8555-555555555555")

USERS = {
    "owner": (OWNER_ID, "owner@test.invalid"),
    "pharmacist": (PHARMACIST_ID, "pharmacist@test.invalid"),
    "staff": (STAFF_ID, "staff@test.invalid"),
    "noprofile": (NO_PROFILE_ID, "noprofile@test.invalid"),
    "inactive": (INACTIVE_ID, "inactive@test.invalid"),
}

# Business tables only — never auth.users / user_profiles.
BUSINESS_TABLES = (
    "sale_items",
    "sales",
    "inventory_transactions",
    "medicine_lots",
    "purchase_items",
    "purchases",
    "invoices",
    "audit_logs",
    "medicines",
    "suppliers",
    "store_profile",
)


class _FakeJWKSClient:
    def get_signing_key_from_jwt(self, token):
        header = jwt.get_unverified_header(token)
        if header.get("kid") != KID:
            raise jwt.PyJWKClientError("unknown kid")
        return SimpleNamespace(key=PUBLIC_KEY)


@pytest.fixture(scope="session", autouse=True)
def test_database():
    """Point the app's pool at the test project and verify JWT locally."""
    settings = get_settings()
    patch = pytest.MonkeyPatch()
    patch.setattr(auth, "get_jwks_client", lambda: _FakeJWKSClient())
    db.close_pool()
    db.open_pool(SimpleNamespace(database_url=SecretStr(TEST_CONFIG["database_url"])))
    if not db.check_database(timeout=15):
        pytest.exit("DB test guard: cannot reach the test database", returncode=2)
    yield settings
    db.close_pool()
    patch.undo()


@pytest.fixture(autouse=True)
def clean_business_tables():
    with db.get_transaction() as cur:
        cur.execute(
            "TRUNCATE TABLE "
            + ", ".join(f"public.{name}" for name in BUSINESS_TABLES)
            + " RESTART IDENTITY CASCADE"
        )
    yield


@pytest.fixture
def client():
    return TestClient(app)


@pytest.fixture
def today():
    with db.get_transaction() as cur:
        return fetch_business_today(cur)


def make_token(role_or_id="owner", *, expires_in=3600, audience="authenticated", issuer=None, kid=KID):
    user_id, email = USERS.get(role_or_id, (role_or_id, "someone@test.invalid"))
    settings = get_settings()
    now = int(time.time())
    payload = {
        "sub": str(user_id),
        "aud": audience,
        "iss": issuer or f"{settings.supabase_url.rstrip('/')}/auth/v1",
        "iat": now,
        "exp": now + expires_in,
        "email": email,
        "role": "authenticated",
    }
    return jwt.encode(payload, PRIVATE_KEY, algorithm="ES256", headers={"kid": kid})


def headers(role="owner"):
    return {"Authorization": f"Bearer {make_token(role)}"}


def api(client, method, path, role="owner", **kwargs):
    return getattr(client, method)(path, headers=headers(role), **kwargs)


def count_rows(table: str, where: str = "", params=()) -> int:
    with db.get_transaction() as cur:
        cur.execute(f"SELECT count(*) AS n FROM public.{table} {where}", params)
        return cur.fetchone()["n"]


def table_counts() -> dict[str, int]:
    return {name: count_rows(name) for name in BUSINESS_TABLES}


def insert_medicine(name="Integration Med", *, selling_price="95.00", barcode=None, is_active=True, reorder_point=None):
    with db.get_transaction() as cur:
        cur.execute(
            """
            INSERT INTO public.medicines (name, selling_price, barcode, is_active, reorder_point, category)
            VALUES (%s, %s, %s, %s, %s, 'INTEGRATION')
            RETURNING id
            """,
            (name, selling_price, barcode, is_active, reorder_point),
        )
        return cur.fetchone()["id"]


def insert_supplier(name="Integration Supplier"):
    with db.get_transaction() as cur:
        cur.execute("INSERT INTO public.suppliers (name) VALUES (%s) RETURNING id", (name,))
        return cur.fetchone()["id"]


def insert_lot(medicine_id, *, lot_number, quantity, exp_offset_days, cost="10.00", received_offset_days=-1, status="active"):
    """Insert a lot with expiry relative to business today (D9)."""
    with db.get_transaction() as cur:
        cur.execute(
            """
            INSERT INTO public.medicine_lots
                (medicine_id, lot_number, quantity_received, quantity_remaining, cost_per_unit,
                 expiry_date, received_date, status)
            VALUES (%s, %s, %s, %s, %s,
                    ((now() AT TIME ZONE 'Asia/Bangkok')::date + %s),
                    ((now() AT TIME ZONE 'Asia/Bangkok')::date + %s), %s)
            RETURNING id, expiry_date
            """,
            (medicine_id, lot_number, quantity, quantity, cost, exp_offset_days, received_offset_days, status),
        )
        return cur.fetchone()
