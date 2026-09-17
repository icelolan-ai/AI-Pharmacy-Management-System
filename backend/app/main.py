"""FastAPI application entry point: uvicorn app.main:app"""

import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from urllib.parse import unquote

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from psycopg.conninfo import conninfo_to_dict

from app import db
from app.config import Settings, get_settings
from app.errors import register_error_handlers
from app.routers import health, me

logger = logging.getLogger("app")


_MIN_PASSWORD_REDACT_LEN = 4


def _redact_handler_output(handler: logging.Handler, secrets: list[str]) -> None:
    """Mask secrets in the handler's final formatted text.

    Works on the output string, so log records (and uvicorn's formatters that
    read record.args) are left untouched.
    """
    original_format = handler.format

    def format_redacted(record: logging.LogRecord) -> str:
        text = original_format(record)
        for secret in secrets:
            text = text.replace(secret, "***")
        return text

    handler.format = format_redacted  # type: ignore[method-assign]


def _configure_logging(settings: Settings) -> None:
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)s %(name)s: %(message)s",
    )
    url = settings.database_url.get_secret_value()
    secrets = {url, unquote(url)}
    try:
        password = str(conninfo_to_dict(url).get("password") or "")
        # Very short values would mask unrelated text; the full URL is always masked.
        if len(password) >= _MIN_PASSWORD_REDACT_LEN:
            secrets |= {password, unquote(password)}
    except Exception:
        pass
    ordered = sorted((s for s in secrets if s), key=len, reverse=True)
    for name in ("", "uvicorn", "uvicorn.error", "uvicorn.access"):
        for handler in logging.getLogger(name).handlers:
            _redact_handler_output(handler, ordered)


settings = get_settings()
_configure_logging(settings)


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    db.open_pool(settings)
    if db.check_database(timeout=5.0):
        logger.info("Database reachable at startup")
    else:
        logger.warning("Database unavailable at startup; pool keeps retrying in background")
    try:
        yield
    finally:
        db.close_pool()


app = FastAPI(
    title="AI Pharmacy Management API",
    version="0.1.0",
    lifespan=lifespan,
    docs_url="/docs" if settings.is_development else None,
    redoc_url="/redoc" if settings.is_development else None,
    openapi_url="/openapi.json" if settings.is_development else None,
)

register_error_handlers(app)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=False,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type"],
)

app.include_router(health.router)
app.include_router(me.router)
