"""Real invoices stay out of git, and real invoices go only to the paid AI (6.3).

docs/06-ai-design.md 4 and Chat A ก.: three layers on the git side —
.gitignore, the script refusing a folder inside the repository, and the
picture allowlist checked here — plus the paid-tier gate on the script.
"""

import subprocess

import pytest

from app.ai.read_invoices import real_run_refusals
from app.config import Settings
from tests.private_files import REPO, allowed, git, not_allowed


def test_every_picture_git_holds_or_has_staged_is_on_the_allowed_list():
    """Catches a real invoice anywhere in the repository, not just one folder."""
    assert not_allowed(git("ls-files")) == []


def test_every_allowed_picture_really_exists():
    """The list must not grow stale names a real file could later take."""
    missing = [path for path in allowed() if not (REPO / path).is_file()]
    assert missing == []


@pytest.mark.parametrize("path", ["private/001-p1.jpg", "backend/private/x.pdf",
                                  "real-invoices/002-p1.jpg", "docs/real-invoices/a.png"])
def test_the_folders_people_make_by_habit_are_ignored(path):
    result = subprocess.run(["git", "check-ignore", "--no-index", "-q", path], cwd=REPO)
    assert result.returncode == 0, f"{path} is not ignored"


def test_a_picture_not_on_the_list_is_refused_wherever_it_is():
    assert not_allowed(["docs/invoice.jpg", "backend/tests/fixtures/new.PNG", "a.pdf", "notes.md"]) == [
        "a.pdf", "backend/tests/fixtures/new.PNG", "docs/invoice.jpg"]


# --- the gate on reading real invoices (Chat A ก.) --------------------------

def settings(**values) -> Settings:
    base = {"database_url": "postgresql://unused", "supabase_url": "https://unused.supabase.co"}
    return Settings(_env_file=None, **{**base, **values})


def test_real_invoices_are_refused_by_default(tmp_path):
    refusals = real_run_refusals(settings(real_invoices_dir=str(tmp_path)), REPO)
    assert any("GEMINI_PAID_TIER_CONFIRMED" in reason for reason in refusals)


def test_real_invoices_need_the_owners_word_on_the_paid_tier(tmp_path):
    outside = tmp_path / "pharmacy-private"
    outside.mkdir()
    assert real_run_refusals(settings(real_invoices_dir=str(outside), gemini_paid_tier_confirmed=True), REPO) == []
    assert real_run_refusals(settings(real_invoices_dir=str(outside), gemini_paid_tier_confirmed=False), REPO) != []


@pytest.mark.parametrize("inside", [".", "backend", "backend/tests/fixtures", "private"])
def test_a_folder_inside_the_repository_is_refused_even_when_paid(inside):
    refusals = real_run_refusals(
        settings(real_invoices_dir=str(REPO / inside), gemini_paid_tier_confirmed=True), REPO)
    assert any("inside the repository" in reason for reason in refusals)


def test_a_missing_folder_is_refused(tmp_path):
    refusals = real_run_refusals(
        settings(real_invoices_dir=str(tmp_path / "nope"), gemini_paid_tier_confirmed=True), REPO)
    assert any("does not exist" in reason for reason in refusals)


def test_the_paid_tier_is_never_taken_from_a_loose_string():
    """GEMINI_PAID_TIER_CONFIRMED=yes-ish must not open the gate by accident."""
    with pytest.raises(ValueError):
        settings(gemini_paid_tier_confirmed="maybe")
