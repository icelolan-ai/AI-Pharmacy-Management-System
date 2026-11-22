"""D86: a test pointed at production stops before any service is called.

Each case uses a stand-in transport that records what reaches it, so
"stopped before the call" is seen, not assumed: the transport stays empty.
"""

import psycopg
import pytest
import httpx
from pydantic import SecretStr

from app.scan import storage
from app.scan.storage import Storage
from tests.db_guard import PROD_PROJECT_REF, TEST_PROJECT_REF
from tests.prod_tripwire import ProductionTouched

PROD = f"https://{PROD_PROJECT_REF}.supabase.co"
TEST = f"https://{TEST_PROJECT_REF}.supabase.co"


@pytest.fixture
def recorded():
    calls = []
    storage.close_http()
    storage._client = httpx.Client(transport=httpx.MockTransport(
        lambda request: calls.append(str(request.url)) or httpx.Response(200, content=b"ok")))
    yield calls
    storage.close_http()


def test_the_tripwire_is_on_for_every_test(no_production_services):
    assert PROD_PROJECT_REF in no_production_services


@pytest.mark.parametrize("call", [
    lambda s: s.download("scan/a.jpg"),
    lambda s: s.upload("scan/a.jpg", b"x", "image/jpeg"),
    lambda s: s.remove(["scan/a.jpg"]),
    lambda s: s.signed_url("scan/a.jpg", 60),
])
def test_the_bucket_of_production_is_never_called(recorded, call):
    with pytest.raises(ProductionTouched):
        call(Storage(base_url=PROD, key=SecretStr("k")))
    assert recorded == [], "the request reached the transport"


def test_the_bucket_of_the_test_project_is_called(recorded):
    assert Storage(base_url=TEST, key=SecretStr("k")).download("scan/a.jpg") == b"ok"
    assert len(recorded) == 1


@pytest.mark.parametrize("url", [f"{PROD}/auth/v1/user", f"{PROD}/rest/v1/medicines",
                                 f"https://sub.{PROD_PROJECT_REF}.supabase.co/x"])
def test_any_other_service_of_production_is_refused_too(url):
    seen = []
    with httpx.Client(transport=httpx.MockTransport(lambda r: seen.append(r) or httpx.Response(200))) as client:
        with pytest.raises(ProductionTouched):
            client.get(url)
    assert seen == []


async def _async_get(url):
    async with httpx.AsyncClient(transport=httpx.MockTransport(lambda r: httpx.Response(200))) as client:
        await client.get(url)


def test_async_requests_are_refused_too():
    import asyncio
    with pytest.raises(ProductionTouched):
        asyncio.run(_async_get(f"{PROD}/storage/v1/object/x"))


# Production's NAME, but a closed port on this machine: if the guard ever
# fails, the attempt dies here instead of knocking on production's door.
# (The first version used the real pooler address, and proving it by
# breaking the guard sent wrong-password logins there — refused, but never
# again.)
@pytest.mark.parametrize("conninfo", [
    f"postgresql://postgres.{PROD_PROJECT_REF}:pw@127.0.0.1:1/postgres",
    f"host=db.{PROD_PROJECT_REF}.supabase.co hostaddr=127.0.0.1 port=1 user=postgres password=pw dbname=postgres",
])
def test_the_production_database_is_never_connected(conninfo):
    # Both ways in: the module-level name and the class the pool uses.
    with pytest.raises(ProductionTouched):
        psycopg.connect(conninfo, connect_timeout=1)
    with pytest.raises(ProductionTouched):
        psycopg.Connection.connect(conninfo, connect_timeout=1)


def test_the_app_cannot_swallow_it():
    """BaseException: an `except Exception` in the app does not hide it."""
    assert not issubclass(ProductionTouched, Exception)
