"""D77 — random test data must be repeatable, and a failure must say how.

Each check runs Python in a separate process with TEST_SEED set, because
the seed is read once when tests.seed is imported.
"""

import os
import re
import subprocess
import sys
from pathlib import Path

BACKEND = Path(__file__).resolve().parents[1]
TESTS = BACKEND / "tests"


def _draw(seed: str) -> str:
    code = (
        "from tests.seed import seeded_bytes, seeded_uuid;"
        "print(seeded_bytes(16, 'x').hex(), seeded_uuid('y'), seeded_bytes(16, 'x').hex())"
    )
    return subprocess.run(
        [sys.executable, "-c", code], cwd=BACKEND, capture_output=True, text=True, check=True,
        env={**os.environ, "TEST_SEED": seed},
    ).stdout.strip()


def test_the_same_seed_gives_the_same_data():
    assert _draw("4242") == _draw("4242")


def test_a_different_seed_gives_different_data():
    """D74: the two values certainly differ, or "the same" proves nothing."""
    assert _draw("4242") != _draw("4243")


def test_draws_within_one_run_differ():
    first, _, second = _draw("4242").split()
    assert first != second


def test_a_failing_test_reports_the_seed_it_ran_with(tmp_path):
    probe = tmp_path / "test_probe.py"
    probe.write_text("def test_fails_on_purpose():\n    assert False\n")
    out = subprocess.run(
        [sys.executable, "-m", "pytest", str(probe), "-p", "tests.seed", "-q", "-p", "no:cacheprovider",
         f"--rootdir={tmp_path}"],
        cwd=BACKEND, capture_output=True, text=True, env={**os.environ, "TEST_SEED": "9001"},
    ).stdout
    assert "D77 seed" in out and "TEST_SEED=9001" in out


def test_no_test_draws_randomness_except_through_the_seed():
    """os.urandom, uuid4 or the random module straight from a test would
    bring back data that cannot be made again."""
    # By name, however it is reached: os.urandom, `from os import urandom`,
    # __import__("os").urandom — any spelling still says urandom or uuid4.
    pattern = re.compile(r"\burandom\b|\buuid4\b|^\s*import random\b|^\s*from random\b|\bsecrets\.\w+\(", re.M)
    offenders = [
        f"{path.relative_to(BACKEND)}:{text[:m.start()].count(chr(10)) + 1}"
        for path in sorted(TESTS.rglob("*.py"))
        if path.name not in ("seed.py", "test_seed.py")
        for text in [path.read_text(encoding="utf8")]
        for m in pattern.finditer(text)
    ]
    assert offenders == []
