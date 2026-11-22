"""Test settings: set before app modules import, so tests never use real secrets.

Process environment overrides backend/.env in pydantic-settings.
The dummy DATABASE_URL points at a closed port; unit tests must not touch a
real database (TestClient is used without the lifespan context).
"""

import os

os.environ["APP_ENV"] = "test"
os.environ["DATABASE_URL"] = "postgresql://test:test@127.0.0.1:1/test"
os.environ["SUPABASE_URL"] = "https://test-project.supabase.co"
os.environ["CORS_ORIGINS"] = "http://localhost:3000"

# D77: one seed for every random value; printed with every run and failure.
pytest_plugins = ["tests.seed"]


# D86: every test, unit or integration, runs with production addresses
# refused at the point every service call passes (tests/prod_tripwire.py).
import pytest  # noqa: E402

from tests.prod_tripwire import installed as _production_refused  # noqa: E402


@pytest.fixture(scope="session", autouse=True)
def no_production_services():
    with _production_refused() as refs:
        yield refs
