"""The private invoice-scans bucket, reached only from here (6.2).

The service role key opens every file in the project, so it never leaves the
backend (source-rules guards the web side). Everything the browser sees is a
signed link that dies after SIGNED_URL_TTL_SECONDS; a new one is made on
every read, never stored.

Verified against the real Storage API before this was written (D67):
  - a sb_secret_ key goes in the `apikey` header; Bearer alone is refused
  - uploading onto an existing path is refused (409) rather than overwritten
  - an unsigned or /public/ link to this bucket is refused
  - deleting a path that is already gone succeeds with an empty list

Errors say which step failed and the HTTP status. Never the key, never the
response body (it can echo the path back, and paths carry scan ids).
"""

from dataclasses import dataclass
from functools import lru_cache
from urllib.parse import quote

import httpx
from pydantic import SecretStr

from app.config import get_settings
from app.errors import AppError

BUCKET = "invoice-scans"
TIMEOUT_SECONDS = 30


def _unavailable(step: str, status: int | None = None) -> AppError:
    return AppError(
        "STORAGE_UNAVAILABLE",
        "ระบบเก็บรูปใช้งานไม่ได้ในขณะนี้ ลองใหม่อีกครั้ง",
        503,
        {"step": step, "status": status},
    )


@dataclass(frozen=True)
class Storage:
    base_url: str
    key: SecretStr

    def _headers(self) -> dict[str, str]:
        return {"apikey": self.key.get_secret_value()}

    def _object_url(self, path: str) -> str:
        return f"{self.base_url}/storage/v1/object/{BUCKET}/{quote(path)}"

    def upload(self, path: str, data: bytes, content_type: str) -> None:
        try:
            response = httpx.post(
                self._object_url(path),
                headers={**self._headers(), "Content-Type": content_type, "x-upsert": "false"},
                content=data,
                timeout=TIMEOUT_SECONDS,
            )
        except httpx.HTTPError:
            raise _unavailable("upload") from None
        if response.status_code != 200:
            raise _unavailable("upload", response.status_code)

    def remove(self, paths: list[str]) -> None:
        if not paths:
            return
        try:
            response = httpx.request(
                "DELETE",
                f"{self.base_url}/storage/v1/object/{BUCKET}",
                headers=self._headers(),
                json={"prefixes": paths},
                timeout=TIMEOUT_SECONDS,
            )
        except httpx.HTTPError:
            raise _unavailable("remove") from None
        if response.status_code != 200:
            raise _unavailable("remove", response.status_code)

    def signed_url(self, path: str, ttl_seconds: int) -> str:
        try:
            response = httpx.post(
                f"{self.base_url}/storage/v1/object/sign/{BUCKET}/{quote(path)}",
                headers=self._headers(),
                json={"expiresIn": ttl_seconds},
                timeout=TIMEOUT_SECONDS,
            )
        except httpx.HTTPError:
            raise _unavailable("sign") from None
        if response.status_code != 200:
            raise _unavailable("sign", response.status_code)
        signed = response.json().get("signedURL")
        if not isinstance(signed, str) or "token=" not in signed:
            raise _unavailable("sign", response.status_code)
        return f"{self.base_url}/storage/v1{signed}"


@lru_cache
def get_storage() -> Storage:
    settings = get_settings()
    key = settings.supabase_service_role_key
    if key is None or not key.get_secret_value().strip():
        raise AppError(
            "STORAGE_NOT_CONFIGURED",
            "ยังไม่ได้ตั้งค่าที่เก็บรูป",
            503,
            {"missing": "SUPABASE_SERVICE_ROLE_KEY"},
        )
    return Storage(base_url=settings.supabase_url.strip().rstrip("/"), key=key)
