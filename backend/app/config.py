"""Application settings loaded from backend/.env (and process environment)."""

from functools import lru_cache
from pathlib import Path

from pydantic import SecretStr, ValidationError, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

ENV_FILE = Path(__file__).resolve().parent.parent / ".env"


class ConfigError(RuntimeError):
    """Raised when required settings are missing or invalid. Never contains values."""


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=ENV_FILE,
        env_file_encoding="utf-8",
        extra="ignore",
    )

    app_env: str = "production"
    database_url: SecretStr
    supabase_url: str
    cors_origins: str = ""
    # D9: "today" is computed in this timezone (verified against PostgreSQL at startup).
    store_timezone: str = "Asia/Bangkok"

    # D53: which AI provider answers. Swapping one for another is this line in
    # backend/.env and nothing else.
    ai_provider: str = "gemini"
    # Which model the provider runs. Deliberately not defaulted in code: two
    # people guessed two different names, and neither was confirmed to exist.
    # `python -m app.ai.check list` asks the provider what it really offers.
    ai_model: str | None = None
    # Optional on purpose: the app must start, serve and be testable with no AI
    # key at all. Only the code that actually calls a provider asks for it, and
    # it says which setting is empty rather than failing somewhere obscure.
    gemini_api_key: SecretStr | None = None

    # 6.2: the backend is the only thing that writes to Storage or signs a
    # URL for it. Optional so the app starts without it; the scan endpoints
    # say which setting is empty when they need it.
    supabase_service_role_key: SecretStr | None = None

    # 6.2 · D72: every limit below says whether it was measured or guessed.
    # The gate on what a phone may send. A real iPhone photo was 18.7 MB
    # (measured); 30 MB leaves room for cameras we have not seen (a margin,
    # not a measurement). Only the backend sees these bytes — the bucket
    # never does.
    max_upload_bytes: int = 30 * 1024 * 1024
    # Must equal the invoice-scans bucket's own limit (asserted by
    # test_storage_db). Measured: the largest file the shrink can produce —
    # 3000 x 3000 of pure noise at q88 — is 7.5 MB.
    stored_max_bytes: int = 10 * 1024 * 1024
    # D68: the copy kept as evidence, and the smaller one the AI reads.
    original_max_edge_px: int = 3000
    original_jpeg_quality: int = 88
    ai_image_max_edge_px: int = 1600
    ai_image_jpeg_quality: int = 80
    # A signed link to a private image lives this long, and a fresh one is
    # made on every read.
    signed_url_ttl_seconds: int = 600

    @field_validator("database_url", "supabase_url", "store_timezone", mode="before")
    @classmethod
    def _not_blank(cls, value):
        if value is None or not str(value).strip():
            raise ValueError("must not be empty")
        return value

    @property
    def is_development(self) -> bool:
        return self.app_env.strip().lower() == "development"

    @property
    def cors_origin_list(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]


@lru_cache
def get_settings() -> Settings:
    try:
        return Settings()
    except ValidationError as exc:
        # Report variable names and problem type only; never the values.
        problems = sorted(
            {
                f"{str(err['loc'][0]).upper()} ({'missing' if err['type'] == 'missing' else 'invalid or empty'})"
                for err in exc.errors()
                if err.get("loc")
            }
        )
        raise ConfigError(
            "Invalid configuration in backend/.env: " + ", ".join(problems)
        ) from None
