"""Safety guard for database-backed tests.

Integration tests may only ever run against the dedicated test Supabase project.
If backend/.env.test points anywhere else (especially the production project),
the test session is stopped immediately. Values are never printed.
"""

import re
from pathlib import Path

import pytest
from dotenv import dotenv_values
from psycopg.conninfo import conninfo_to_dict

TEST_PROJECT_REF = "ftulvwmjyowcnyhkobzx"  # ai-pharmacy-test
PROD_PROJECT_REF = "amkdeclxsltafersipck"  # ai-pharmacy-management (never touch)

BACKEND_DIR = Path(__file__).resolve().parent.parent
ENV_TEST_PATH = BACKEND_DIR / ".env.test"
ENV_PATH = BACKEND_DIR / ".env"

_SUPABASE_HOST = re.compile(r"^https://([a-z0-9]+)\.supabase\.co/?$", re.IGNORECASE)


def ref_from_supabase_url(url: str) -> str | None:
    match = _SUPABASE_HOST.match((url or "").strip())
    return match.group(1).lower() if match else None


def ref_from_database_url(url: str) -> str | None:
    """Session pooler user is 'postgres.<ref>'; direct host is 'db.<ref>.supabase.co'."""
    try:
        parts = conninfo_to_dict((url or "").strip())
    except Exception:
        return None
    user = str(parts.get("user") or "")
    if "." in user:
        return user.split(".", 1)[1].lower()
    host = str(parts.get("host") or "")
    if host.startswith("db.") and host.endswith(".supabase.co"):
        return host[3:-len(".supabase.co")].lower()
    return None


def _stop(reason: str) -> None:
    pytest.exit(f"DB test guard: {reason} (check backend/.env.test)", returncode=2)


def ensure_test_database() -> dict[str, str] | None:
    """Return test settings, None if not configured at all, or stop the session.

    Not configured -> None so `pytest` can skip db tests (spec 11).
    Configured but pointing at the wrong project -> hard stop.
    """
    env = dotenv_values(ENV_TEST_PATH) if ENV_TEST_PATH.exists() else {}
    db_url = (env.get("TEST_DATABASE_URL") or "").strip()
    supabase_url = (env.get("TEST_SUPABASE_URL") or "").strip()
    publishable_key = (env.get("TEST_SUPABASE_PUBLISHABLE_KEY") or "").strip()

    if not db_url and not supabase_url:
        return None
    if not db_url or not supabase_url:
        _stop("TEST_DATABASE_URL and TEST_SUPABASE_URL must both be set")

    db_ref = ref_from_database_url(db_url)
    api_ref = ref_from_supabase_url(supabase_url)
    if db_ref is None:
        _stop("TEST_DATABASE_URL is not a recognisable Supabase connection string")
    if api_ref is None:
        _stop("TEST_SUPABASE_URL is not https://<ref>.supabase.co")
    if db_ref != api_ref:
        _stop("TEST_DATABASE_URL and TEST_SUPABASE_URL are different projects")
    if db_ref != TEST_PROJECT_REF:
        _stop("test settings do not point at the ai-pharmacy-test project")
    if PROD_PROJECT_REF in (db_ref, api_ref):
        _stop("test settings point at the production project")

    prod_env = dotenv_values(ENV_PATH) if ENV_PATH.exists() else {}
    prod_ref = ref_from_database_url((prod_env.get("DATABASE_URL") or "").strip())
    if prod_ref is not None and prod_ref == db_ref:
        _stop("test database is the same project as backend/.env")

    return {
        "database_url": db_url,
        "supabase_url": supabase_url,
        "publishable_key": publishable_key,
        "project_ref": db_ref,
    }
