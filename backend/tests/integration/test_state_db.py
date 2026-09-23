"""Test-project state + health (spec 11 #1). Read-only: never runs migrations."""

from datetime import datetime, timedelta, timezone

import pytest

from app import db
from tests.integration.conftest import BUSINESS_TABLES, api

pytestmark = pytest.mark.db

# 12 from migrations 001–008, plus the four map tables from 009 (U-8.1).
EXPECTED_TABLES = 16

# Named rather than only counted: a count says four tables arrived, not which
# four, and this is the assertion that tells us migration 009 really ran here.
MAP_TABLES = {
    "store_maps",
    "store_map_shapes",
    "store_map_points",
    "store_map_point_medicines",
}


def test_test_project_has_every_migration_applied():
    with db.get_transaction() as cur:
        cur.execute(
            "SELECT count(*) AS n FROM information_schema.tables"
            " WHERE table_schema = 'public' AND table_type = 'BASE TABLE'"
        )
        tables = cur.fetchone()["n"]
        cur.execute("SELECT count(*) AS n FROM pg_policies WHERE schemaname = 'public'")
        policies = cur.fetchone()["n"]
        cur.execute(
            "SELECT count(*) AS n FROM pg_class c JOIN pg_namespace ns ON ns.oid = c.relnamespace"
            " WHERE ns.nspname = 'public' AND c.relkind = 'r' AND c.relrowsecurity"
        )
        rls = cur.fetchone()["n"]
        cur.execute("SELECT count(*) AS n FROM public.user_profiles")
        profiles = cur.fetchone()["n"]
        cur.execute("SELECT count(*) AS n FROM auth.users")
        users = cur.fetchone()["n"]
        cur.execute(
            "SELECT table_name FROM information_schema.tables"
            " WHERE table_schema = 'public' AND table_name = ANY(%s)",
            (sorted(MAP_TABLES),),
        )
        map_tables = {row["table_name"] for row in cur.fetchall()}

    assert map_tables == MAP_TABLES, f"migration 009 missing: {sorted(MAP_TABLES - map_tables)}"
    assert tables == EXPECTED_TABLES, f"expected {EXPECTED_TABLES} tables, found {tables}"
    assert policies == 0, f"expected 0 RLS policies, found {policies}"
    assert rls == EXPECTED_TABLES, f"expected RLS on {EXPECTED_TABLES} tables, found {rls}"
    assert profiles == 4, f"expected 4 user_profiles, found {profiles}"
    assert users >= 5, f"expected at least 5 auth users, found {users}"


def test_business_today_matches_bangkok_date():
    with db.get_transaction() as cur:
        cur.execute("SELECT (now() AT TIME ZONE 'Asia/Bangkok')::date AS d, now() AS utc_now")
        row = cur.fetchone()
    expected = (row["utc_now"].astimezone(timezone.utc) + timedelta(hours=7)).date()
    assert row["d"] == expected


def test_health_endpoint_reports_database_ok(client):
    resp = client.get("/health")
    assert resp.status_code == 200
    assert resp.json() == {"status": "ok", "database": "ok"}


def test_truncate_fixture_leaves_business_tables_empty():
    for table in BUSINESS_TABLES:
        with db.get_transaction() as cur:
            cur.execute(f"SELECT count(*) AS n FROM public.{table}")
            assert cur.fetchone()["n"] == 0, table


def test_user_profiles_are_untouched_by_tests(client):
    resp = api(client, "get", "/api/v1/me", "owner")
    assert resp.status_code == 200
    assert resp.json()["role"] == "owner"
