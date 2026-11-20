"""One HTTP client for the bucket, opened and closed with the app (Chat A,
after the 2.1 s measurement).

A fresh connection per call paid the TLS handshake every time: 220 ms per
264 KB upload against 177 ms on a kept connection. These checks run the real
lifespan and the real Storage methods against a stand-in transport; nothing
leaves the machine.
"""

import asyncio

import httpx
import pytest
from pydantic import SecretStr

from app import db
from app import main
from app.scan import storage
from app.scan.storage import Storage


@pytest.fixture
def no_database(monkeypatch):
    """The lifespan also opens the pool; unit tests never touch a database."""
    monkeypatch.setattr(db, "open_pool", lambda settings: None)
    monkeypatch.setattr(db, "close_pool", lambda: None)
    monkeypatch.setattr(db, "check_database", lambda timeout=3.0: False)


@pytest.fixture
def closed_client():
    storage.close_http()
    yield
    storage.close_http()


def test_the_app_opens_one_client_and_closes_it_when_it_stops(no_database, closed_client):
    seen = {}

    async def run():
        async with main.lifespan(main.app):
            seen["inside"] = storage._client
    asyncio.run(run())

    assert isinstance(seen["inside"], httpx.Client), "the app did not open the bucket's client"
    assert seen["inside"].is_closed, "the client was left open after the app stopped"
    assert storage._client is None


def test_every_wait_has_a_stated_limit(closed_client):
    storage.open_http()
    timeout = storage._client.timeout
    assert (timeout.connect, timeout.read, timeout.write, timeout.pool) == (10, 30, 30, 30)


def test_without_the_app_the_client_is_refused_not_made_on_the_side(closed_client):
    s = Storage(base_url="https://bucket.test", key=SecretStr("k"))
    with pytest.raises(RuntimeError, match="not open"):
        s.upload("a/b.jpg", b"x", "image/jpeg")


def test_every_call_goes_through_the_one_client(closed_client):
    """upload, sign and remove all reach the shared client's transport; one
    made per call would miss it (and try the real network)."""
    calls = []

    def answer(request: httpx.Request) -> httpx.Response:
        calls.append((request.method, request.url.path))
        if "/sign/" in request.url.path:
            return httpx.Response(200, json={"signedURL": "/object/sign/x?token=t"})
        return httpx.Response(200, json=[])

    storage._client = httpx.Client(transport=httpx.MockTransport(answer))
    s = Storage(base_url="https://bucket.test", key=SecretStr("k"))
    s.upload("scan/a.jpg", b"x", "image/jpeg")
    s.signed_url("scan/a.jpg", 60)
    s.remove(["scan/a.jpg"])
    assert [m for m, _ in calls] == ["POST", "POST", "DELETE"], calls
