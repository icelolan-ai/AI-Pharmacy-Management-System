"""The AI seam, driven without a network or a key (D53 · งาน 6.1).

These cover what can be settled before anyone has a key: that the key never
travels in a URL, never comes back in an error, that the model list follows
every page, and that a missing model or key says which setting to fill.

The real call is `python -m app.ai.check` / `check list`, run by a person with
a key in backend/.env. Nothing here pretends to replace that.
"""

import httpx
import pytest
from pydantic import SecretStr

from app.ai import get_provider
from app.ai.gemini import GeminiProvider
from app.config import ConfigError, Settings
from app.errors import AppError

FAKE_KEY = "fake-key-for-tests-0123456789"


class Recorder:
    """Stands in for httpx.get / httpx.post and remembers every call."""

    def __init__(self, responses):
        self.responses = list(responses)
        self.calls = []

    def __call__(self, url, **kwargs):
        self.calls.append({"url": url, **kwargs})
        status, body = self.responses.pop(0)
        return httpx.Response(status, json=body, request=httpx.Request("GET", url))


def settings(**overrides) -> Settings:
    base = {
        "database_url": "postgresql://unused",
        "supabase_url": "https://unused.supabase.co",
        "ai_provider": "gemini",
    }
    return Settings(_env_file=None, **{**base, **overrides})


# --- the key goes in a header, and never comes back out -------------------


def test_key_travels_in_a_header_never_in_the_url(monkeypatch):
    recorder = Recorder([(200, {"candidates": [{"content": {"parts": [{"text": "พร้อม"}]}}]})])
    monkeypatch.setattr(httpx, "post", recorder)
    GeminiProvider(SecretStr(FAKE_KEY), "some-model").complete("hi")

    call = recorder.calls[0]
    assert FAKE_KEY not in call["url"], "a key in the URL ends up in every log along the way"
    assert FAKE_KEY not in str(call.get("params") or "")
    assert call["headers"]["x-goog-api-key"] == FAKE_KEY


def test_the_key_never_appears_in_an_error(monkeypatch):
    recorder = Recorder([(403, {"error": {"message": f"bad key {FAKE_KEY}"}})])
    monkeypatch.setattr(httpx, "post", recorder)
    with pytest.raises(AppError) as caught:
        GeminiProvider(SecretStr(FAKE_KEY), "some-model").complete("hi")
    error = caught.value
    assert FAKE_KEY not in error.message
    assert FAKE_KEY not in str(error.details), "a provider that echoes the key must not have it passed on"
    assert error.details["status"] == 403


def test_list_models_sends_the_key_in_a_header_too(monkeypatch):
    recorder = Recorder([(200, {"models": []})])
    monkeypatch.setattr(httpx, "get", recorder)
    GeminiProvider(SecretStr(FAKE_KEY)).list_models()
    call = recorder.calls[0]
    assert FAKE_KEY not in call["url"]
    assert FAKE_KEY not in str(call.get("params") or "")
    assert call["headers"]["x-goog-api-key"] == FAKE_KEY


# --- the model list is the provider's own answer, all of it ---------------


def test_list_models_follows_every_page_and_keeps_the_usable_ones(monkeypatch):
    recorder = Recorder(
        [
            (200, {
                "models": [
                    {"name": "models/alpha", "displayName": "Alpha",
                     "supportedGenerationMethods": ["generateContent"],
                     "inputTokenLimit": 1000, "outputTokenLimit": 100},
                    {"name": "models/embed-only",
                     "supportedGenerationMethods": ["embedContent"]},
                ],
                "nextPageToken": "page-2",
            }),
            (200, {"models": [{"name": "models/beta", "supportedGenerationMethods": ["generateContent"]}]}),
        ]
    )
    monkeypatch.setattr(httpx, "get", recorder)
    models = GeminiProvider(SecretStr(FAKE_KEY)).list_models()

    assert [m.name for m in models] == ["alpha", "embed-only", "beta"], "every page, prefix stripped"
    assert [m.can_generate for m in models] == [True, False, True]
    assert recorder.calls[1]["params"]["pageToken"] == "page-2"
    # Limits the provider did not report stay None rather than being made up.
    assert models[2].input_token_limit is None


# --- a missing setting says which one ---------------------------------------


def test_no_key_names_the_setting_and_never_a_value():
    with pytest.raises(ConfigError) as caught:
        get_provider(settings(gemini_api_key=None))
    assert "GEMINI_API_KEY" in str(caught.value)


def test_a_blank_key_is_treated_as_no_key():
    # A model is supplied so the key is the only thing that can be wrong. The
    # first version of this test passed with the blank-key check deleted: the
    # missing AI_MODEL raised a ConfigError of its own, and "some ConfigError"
    # was all the test asked for.
    with pytest.raises(ConfigError) as caught:
        get_provider(settings(gemini_api_key="   ", ai_model="some-model"))
    assert "GEMINI_API_KEY" in str(caught.value)


def test_no_model_names_the_setting_and_the_list_command():
    with pytest.raises(ConfigError) as caught:
        get_provider(settings(gemini_api_key=FAKE_KEY, ai_model=None))
    assert "AI_MODEL" in str(caught.value)
    assert "check list" in str(caught.value)


def test_listing_models_does_not_need_a_model():
    provider = get_provider(settings(gemini_api_key=FAKE_KEY, ai_model=None), need_model=False)
    assert provider.model is None


def test_the_model_comes_from_settings_not_from_the_code():
    provider = get_provider(settings(gemini_api_key=FAKE_KEY, ai_model="whatever-was-chosen"))
    assert provider.model == "whatever-was-chosen"


def test_an_unknown_provider_lists_the_ones_that_exist():
    with pytest.raises(ConfigError) as caught:
        get_provider(settings(gemini_api_key=FAKE_KEY, ai_model="m", ai_provider="nobody"))
    assert "gemini" in str(caught.value)
