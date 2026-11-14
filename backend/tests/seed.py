"""D77 — every random value in the tests comes from one seed.

A test that fails once on random data and passes on the rerun cannot be
followed up unless the data can be made again. So nothing in the tests uses
os.urandom or uuid.uuid4 directly: they use seeded_bytes and seeded_uuid,
which draw from one seed per run.

    TEST_SEED=123456 python -m pytest ...   # the same data as that run

The seed is printed at the end of every run and attached to every failure
(the hooks at the bottom, loaded by tests/conftest.py).

Each test gets its own stream, keyed by its id, so re-running one failing
test alone with the same seed reproduces the data it saw. Values made at
import time, or by module-scoped fixtures, are keyed by a fixed salt
instead, because which test runs first can change.
"""

import os
import random
import uuid

SEED = int(os.environ.get("TEST_SEED") or random.SystemRandom().randrange(1, 2**32))

_drawn: dict[str, int] = {}


def _stream(salt: str | None) -> random.Random:
    if salt is None:
        current = os.environ.get("PYTEST_CURRENT_TEST", "")
        salt = current.rsplit(" (", 1)[0] or "import-time"
    n = _drawn.get(salt, 0)
    _drawn[salt] = n + 1
    return random.Random(f"{SEED}:{salt}:{n}")


def seeded_bytes(n: int, salt: str | None = None) -> bytes:
    return _stream(salt).randbytes(n)


def seeded_uuid(salt: str | None = None) -> uuid.UUID:
    return uuid.UUID(int=_stream(salt).getrandbits(128), version=4)


# --- pytest hooks: say the seed out loud ------------------------------------

def pytest_report_header(config):
    return f"D77 TEST_SEED={SEED}"


def pytest_terminal_summary(terminalreporter):
    terminalreporter.write_line(f"D77 TEST_SEED={SEED}  (run again with TEST_SEED={SEED} for the same data)")


def pytest_runtest_logreport(report):
    if report.failed:
        report.sections.append(("D77 seed", f"TEST_SEED={SEED} - run again with this for the same data"))
