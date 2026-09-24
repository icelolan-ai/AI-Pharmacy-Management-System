"""Choosing an AI provider (D53).

`AI_PROVIDER` in `backend/.env` decides which one runs. Adding a second
provider means adding one entry to BUILDERS below; no caller changes.

The key lives in `backend/.env` and is read through Settings like every other
secret. It is never read in the browser: `source-rules.check.mjs` fails the
build if anything under `web/src` so much as names it, because a key that
reaches a browser once is a key that has to be replaced.
"""

from collections.abc import Callable

from app.ai.base import AIProvider, AIResult
from app.ai.gemini import GeminiProvider
from app.config import ConfigError, Settings, get_settings


def _build_gemini(settings: Settings) -> AIProvider:
    if settings.gemini_api_key is None:
        # Names the setting and the file, never a value.
        raise ConfigError(
            "GEMINI_API_KEY ยังว่างอยู่ใน backend/.env — กรุณาเติมคีย์ก่อนใช้งาน AI"
        )
    return GeminiProvider(settings.gemini_api_key)


BUILDERS: dict[str, Callable[[Settings], AIProvider]] = {
    "gemini": _build_gemini,
}


def get_provider(settings: Settings | None = None) -> AIProvider:
    settings = settings or get_settings()
    name = settings.ai_provider.strip().lower()
    builder = BUILDERS.get(name)
    if builder is None:
        raise ConfigError(
            f"AI_PROVIDER ใน backend/.env ไม่รู้จัก: {name!r} — "
            f"ที่รองรับตอนนี้: {', '.join(sorted(BUILDERS))}"
        )
    return builder(settings)


__all__ = ["AIProvider", "AIResult", "BUILDERS", "get_provider"]
