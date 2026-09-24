"""Gemini, behind the provider seam (D53).

The key travels in a header, never in the query string. A key in a URL ends
up in server logs, in proxy logs and in browser history, and the project's own
rule already forbids putting secrets in URLs.
"""

import time
from typing import Any

import httpx
from pydantic import SecretStr

from app.ai.base import AIResult
from app.errors import AppError

BASE_URL = "https://generativelanguage.googleapis.com/v1beta"
DEFAULT_MODEL = "gemini-2.0-flash"
DEFAULT_TIMEOUT = 30.0


def _unavailable(message: str, details: Any = None) -> AppError:
    """503, because a provider being down is not the caller's mistake.

    `details` never carries the key, the header or the request body — only the
    status and a short reason.
    """
    return AppError("AI_UNAVAILABLE", message, 503, details)


class GeminiProvider:
    name = "gemini"

    def __init__(self, api_key: SecretStr, model: str = DEFAULT_MODEL) -> None:
        self._api_key = api_key
        self.model = model

    def complete(self, prompt: str, *, timeout: float = DEFAULT_TIMEOUT) -> AIResult:
        url = f"{BASE_URL}/models/{self.model}:generateContent"
        started = time.perf_counter()
        try:
            response = httpx.post(
                url,
                # In a header, not in ?key= — see the note at the top.
                headers={
                    "x-goog-api-key": self._api_key.get_secret_value(),
                    "Content-Type": "application/json",
                },
                json={"contents": [{"parts": [{"text": prompt}]}]},
                timeout=timeout,
            )
        except httpx.HTTPError as exc:
            raise _unavailable(
                "เรียกผู้ให้บริการ AI ไม่สำเร็จ", {"reason": type(exc).__name__}
            ) from exc
        latency_ms = int((time.perf_counter() - started) * 1000)

        if response.status_code != 200:
            # The body can echo request details, so only the status goes out.
            raise _unavailable(
                "ผู้ให้บริการ AI ตอบกลับด้วยข้อผิดพลาด",
                {"status": response.status_code, "provider": self.name},
            )

        try:
            body = response.json()
            parts = body["candidates"][0]["content"]["parts"]
            text = "".join(part.get("text", "") for part in parts)
        except (ValueError, KeyError, IndexError) as exc:
            raise _unavailable(
                "อ่านคำตอบจากผู้ให้บริการ AI ไม่ได้", {"reason": type(exc).__name__}
            ) from exc

        usage = body.get("usageMetadata") or {}
        return AIResult(
            text=text,
            provider=self.name,
            model=self.model,
            prompt_tokens=usage.get("promptTokenCount"),
            completion_tokens=usage.get("candidatesTokenCount"),
            total_tokens=usage.get("totalTokenCount"),
            latency_ms=latency_ms,
        )
