"""Gemini, behind the provider seam (D53).

The key travels in a header, never in the query string. A key in a URL ends
up in server logs, in proxy logs and in browser history, and the project's own
rule already forbids putting secrets in URLs.

No model name is written here. It comes from AI_MODEL in backend/.env, chosen
from what `list_models()` reports the provider really offers — not from what
anyone remembers the names to be.
"""

import time
from typing import Any

import httpx
from pydantic import SecretStr

from app.ai.base import AIResult, ModelInfo
from app.errors import AppError

BASE_URL = "https://generativelanguage.googleapis.com/v1beta"
DEFAULT_TIMEOUT = 30.0
# A page of the model list; the loop follows nextPageToken for the rest.
LIST_PAGE_SIZE = 100
# A guard against a provider that keeps handing back a token forever.
LIST_MAX_PAGES = 20


def _unavailable(message: str, details: Any = None) -> AppError:
    """503, because a provider being down is not the caller's mistake.

    `details` never carries the key, the header or the request body — only the
    status and a short reason.
    """
    return AppError("AI_UNAVAILABLE", message, 503, details)


class GeminiProvider:
    name = "gemini"

    def __init__(self, api_key: SecretStr, model: str | None = None) -> None:
        self._api_key = api_key
        self.model = model

    def _headers(self) -> dict[str, str]:
        # In a header, not in ?key= — see the note at the top.
        return {
            "x-goog-api-key": self._api_key.get_secret_value(),
            "Content-Type": "application/json",
        }

    def complete(self, prompt: str, *, timeout: float = DEFAULT_TIMEOUT) -> AIResult:
        if not self.model:
            # Checked here as well as when the provider is built, so a caller
            # that constructs one by hand still gets the setting's name.
            raise AppError(
                "AI_NOT_CONFIGURED",
                "AI_MODEL ยังว่างอยู่ใน backend/.env — รัน python -m app.ai.check list เพื่อดูรายชื่อ",
                500,
            )
        url = f"{BASE_URL}/models/{self.model}:generateContent"
        started = time.perf_counter()
        try:
            response = httpx.post(
                url,
                headers=self._headers(),
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
                {"status": response.status_code, "provider": self.name, "model": self.model},
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

    def list_models(self, *, timeout: float = DEFAULT_TIMEOUT) -> list[ModelInfo]:
        """Every model the key can see, following the pages to the end."""
        found: list[ModelInfo] = []
        page_token: str | None = None
        for _ in range(LIST_MAX_PAGES):
            params: dict[str, Any] = {"pageSize": LIST_PAGE_SIZE}
            if page_token:
                params["pageToken"] = page_token
            try:
                response = httpx.get(
                    f"{BASE_URL}/models", headers=self._headers(), params=params, timeout=timeout
                )
            except httpx.HTTPError as exc:
                raise _unavailable(
                    "ขอรายชื่อโมเดลไม่สำเร็จ", {"reason": type(exc).__name__}
                ) from exc
            if response.status_code != 200:
                raise _unavailable(
                    "ผู้ให้บริการ AI ปฏิเสธการขอรายชื่อโมเดล",
                    {"status": response.status_code, "provider": self.name},
                )
            body = response.json()
            for entry in body.get("models", []):
                methods = entry.get("supportedGenerationMethods") or []
                found.append(
                    ModelInfo(
                        # "models/gemini-x" -> "gemini-x", the form AI_MODEL takes.
                        name=str(entry.get("name", "")).removeprefix("models/"),
                        display_name=entry.get("displayName"),
                        can_generate="generateContent" in methods,
                        input_token_limit=entry.get("inputTokenLimit"),
                        output_token_limit=entry.get("outputTokenLimit"),
                    )
                )
            page_token = body.get("nextPageToken")
            if not page_token:
                break
        return found
