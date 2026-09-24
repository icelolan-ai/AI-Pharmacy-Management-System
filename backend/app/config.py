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
    # Optional on purpose: the app must start, serve and be testable with no AI
    # key at all. Only the code that actually calls a provider asks for it, and
    # it says which setting is empty rather than failing somewhere obscure.
    gemini_api_key: SecretStr | None = None

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
