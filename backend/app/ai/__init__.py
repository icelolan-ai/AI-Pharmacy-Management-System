"""Choosing an AI provider (D53).

`AI_PROVIDER` in `backend/.env` decides which one runs and `AI_MODEL` which
model it uses. Adding a second provider means adding one entry to BUILDERS
below; no caller changes.

The key lives in `backend/.env` and is read through Settings like every other
secret. It is never read in the browser: `source-rules.check.mjs` fails the
build if anything under `web/src` so much as names it, because a key that
reaches a browser once is a key that has to be replaced.
"""

from collections.abc import Callable

from app.ai.base import AIProvider, AIResult, ModelInfo
from app.ai.gemini import GeminiProvider
from app.config import ConfigError, Settings, get_settings


def _build_gemini(settings: Settings, *, need_model: bool) -> AIProvider:
    key = settings.gemini_api_key
    if key is None or not key.get_secret_value().strip():
        # Names the setting and the file, never a value.
        raise ConfigError(
            "GEMINI_API_KEY ยังว่างอยู่ใน backend/.env — กรุณาเติมคีย์ก่อนใช้งาน AI"
        )
    model = (settings.ai_model or "").strip() or None
    if need_model and model is None:
        raise ConfigError(
            "AI_MODEL ยังว่างอยู่ใน backend/.env — "
            "รัน python -m app.ai.check list เพื่อดูรายชื่อโมเดลที่มีให้ใช้จริง แล้วเลือกหนึ่งตัว"
        )
    return GeminiProvider(key, model)


BUILDERS: dict[str, Callable[..., AIProvider]] = {
    "gemini": _build_gemini,
}


def get_provider(settings: Settings | None = None, *, need_model: bool = True) -> AIProvider:
    """The configured provider.

    `need_model=False` is for asking the provider what models exist, which
    needs a key but — by definition — cannot need a model yet.
    """
    settings = settings or get_settings()
    name = settings.ai_provider.strip().lower()
    builder = BUILDERS.get(name)
    if builder is None:
        raise ConfigError(
            f"AI_PROVIDER ใน backend/.env ไม่รู้จัก: {name!r} — "
            f"ที่รองรับตอนนี้: {', '.join(sorted(BUILDERS))}"
        )
    return builder(settings, need_model=need_model)


__all__ = ["AIProvider", "AIResult", "BUILDERS", "ModelInfo", "get_provider"]
