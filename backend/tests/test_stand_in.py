"""The stand-in for the AI (Chat A, after 6.4).

🔴 Off unless set by hand; never outside development, whatever is set
(Before-Production list, docs/06-ai-design.md 11); it answers only with a
fake invoice's truth, and the answer passes the same checks as the AI's.
"""

import pytest

from app.ai.stand_in import PROVIDER_NAME, StandInProvider, answer_from_truth, main, stand_in_refusals
from app.config import Settings
from app.scan.invoice_answer import parse_answer


def settings(**values) -> Settings:
    base = {"database_url": "postgresql://unused", "supabase_url": "https://unused.supabase.co"}
    return Settings(_env_file=None, **{**base, **values})


def test_it_is_off_by_default_even_in_development():
    assert stand_in_refusals(settings(app_env="development")) != []
    with pytest.raises(RuntimeError):
        StandInProvider(settings(app_env="development"))


@pytest.mark.parametrize("app_env", ["production", "Production", "staging", "test", ""])
def test_it_never_runs_outside_development_whatever_is_set(app_env):
    """🔴 Before Production: impossible to turn on there."""
    refusals = stand_in_refusals(settings(app_env=app_env, ai_stand_in_enabled=True))
    assert any("never runs in production" in reason for reason in refusals)
    with pytest.raises(RuntimeError):
        StandInProvider(settings(app_env=app_env, ai_stand_in_enabled=True))


def test_the_app_is_production_unless_told_otherwise():
    assert stand_in_refusals(settings(ai_stand_in_enabled=True)) != []


def test_on_by_hand_in_development_it_runs():
    assert stand_in_refusals(settings(app_env="development", ai_stand_in_enabled=True)) == []


def test_its_answer_is_a_fake_invoice_and_passes_the_same_checks():
    provider = StandInProvider(settings(app_env="development", ai_stand_in_enabled=True))
    result = provider.complete_json([], {}, timeout=1, max_output_tokens=1)
    answer = parse_answer(result.text, 2)
    assert result.provider == PROVIDER_NAME and "FAKE" in answer.supplier_name.text
    assert answer.lines[0].lot.confidence == 0.7   # one field a person must touch


def test_the_command_refuses_without_the_switches(monkeypatch, capsys):
    monkeypatch.setattr("app.ai.stand_in.get_settings", lambda: settings())
    assert main(["x", "prepare", "00000000-0000-4000-8000-000000000000"]) == 1
    assert "never runs in production" in capsys.readouterr().out


def test_the_fake_answer_is_what_the_fake_paper_says():
    assert answer_from_truth("fake-b")["lines"][1]["repeat"]["derived_name"] == "แอมม็อกซี่ 250"
