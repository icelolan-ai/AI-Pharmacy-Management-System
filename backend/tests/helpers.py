"""Shared test helpers: fake users, fake DB cursor, error-format assertion."""

import uuid
from contextlib import contextmanager
from datetime import datetime, timezone

from app.auth import CurrentUser

NOW = datetime(2026, 9, 17, 12, 0, tzinfo=timezone.utc)


def make_user(role: str) -> CurrentUser:
    return CurrentUser(id=uuid.uuid4(), email=f"{role}@example.com", full_name=role, role=role)


def assert_error(resp, status: int, code: str) -> dict:
    assert resp.status_code == status, resp.text
    body = resp.json()
    assert set(body) == {"error"}
    assert set(body["error"]) == {"code", "message", "details"}
    assert body["error"]["code"] == code
    assert isinstance(body["error"]["message"], str) and body["error"]["message"]
    return body


class FakeCursor:
    """Returns queued fetchone/fetchall results; can raise on the Nth execute."""

    def __init__(self, fetchone=(), fetchall=(), raise_on_execute=None):
        self.fetchone_results = list(fetchone)
        self.fetchall_results = list(fetchall)
        self.raise_on_execute = raise_on_execute or {}
        self.executed = []

    def execute(self, query, params=None):
        index = len(self.executed)
        self.executed.append((query, params))
        if index in self.raise_on_execute:
            raise self.raise_on_execute[index]

    def fetchone(self):
        return self.fetchone_results.pop(0) if self.fetchone_results else None

    def fetchall(self):
        return self.fetchall_results.pop(0) if self.fetchall_results else []


def fake_transaction(cursor: FakeCursor):
    @contextmanager
    def _tx():
        yield cursor

    return _tx
