"""Supabase JWT authentication, user profile loading and role checks.

Tokens are verified with the project's public JWKS (asymmetric keys only).
Never log the token or any part of it.
"""

import logging
import uuid
from collections.abc import Callable
from dataclasses import dataclass
from functools import lru_cache
from typing import Annotated, Any

import jwt
from fastapi import Depends
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app import db
from app.config import get_settings
from app.errors import AppError

logger = logging.getLogger(__name__)

# Supabase JWKS for this project publishes ES256 keys (checked in task 3.5).
# Never add "none" or HS* here.
ALLOWED_ALGORITHMS = ["ES256"]
AUDIENCE = "authenticated"
LEEWAY_SECONDS = 30
JWKS_CACHE_SECONDS = 600
JWKS_TIMEOUT_SECONDS = 5

_bearer = HTTPBearer(auto_error=False, bearerFormat="JWT")


@dataclass(frozen=True)
class CurrentUser:
    id: uuid.UUID
    email: str | None
    full_name: str | None
    role: str


def _unauthenticated() -> AppError:
    return AppError("UNAUTHENTICATED", "กรุณาเข้าสู่ระบบ", 401)


def _supabase_base_url() -> str:
    return get_settings().supabase_url.strip().rstrip("/")


@lru_cache
def get_jwks_client() -> jwt.PyJWKClient:
    """One shared client; the JWK set is cached and refreshed on unknown kid."""
    return jwt.PyJWKClient(
        f"{_supabase_base_url()}/auth/v1/.well-known/jwks.json",
        cache_jwk_set=True,
        lifespan=JWKS_CACHE_SECONDS,
        timeout=JWKS_TIMEOUT_SECONDS,
    )


def verify_token(token: str) -> dict[str, Any]:
    """Return verified claims or raise AppError (401, or 503 if JWKS unreachable)."""
    try:
        header = jwt.get_unverified_header(token)
    except jwt.PyJWTError:
        raise _unauthenticated() from None

    # Reject disallowed algorithms before any key lookup or network call.
    if header.get("alg") not in ALLOWED_ALGORITHMS:
        raise _unauthenticated()

    try:
        signing_key = get_jwks_client().get_signing_key_from_jwt(token)
    except jwt.PyJWKClientConnectionError as exc:
        logger.warning("JWKS unavailable: %s", type(exc).__name__)
        raise AppError(
            "SERVICE_UNAVAILABLE", "ไม่สามารถตรวจสอบการเข้าสู่ระบบได้ในขณะนี้", 503
        ) from None
    except jwt.PyJWTError:
        raise _unauthenticated() from None

    try:
        claims = jwt.decode(
            token,
            signing_key.key,
            algorithms=ALLOWED_ALGORITHMS,
            audience=AUDIENCE,
            issuer=f"{_supabase_base_url()}/auth/v1",
            leeway=LEEWAY_SECONDS,
            options={"require": ["exp", "sub", "aud", "iss"]},
        )
    except jwt.PyJWTError as exc:
        logger.info("Token rejected: %s", type(exc).__name__)
        raise _unauthenticated() from None

    try:
        uuid.UUID(str(claims["sub"]))
    except (ValueError, TypeError):
        raise _unauthenticated() from None

    return claims


def load_user_profile(user_id: uuid.UUID) -> dict[str, Any] | None:
    with db.get_transaction() as cur:
        cur.execute(
            "SELECT full_name, role, is_active FROM public.user_profiles WHERE id = %s",
            (user_id,),
        )
        return cur.fetchone()


def get_current_user(
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(_bearer)],
) -> CurrentUser:
    if credentials is None or not credentials.credentials:
        raise _unauthenticated()

    claims = verify_token(credentials.credentials)
    user_id = uuid.UUID(str(claims["sub"]))

    profile = load_user_profile(user_id)
    if profile is None:
        raise AppError("FORBIDDEN", "บัญชีนี้ยังไม่ได้รับสิทธิ์ใช้งานระบบ", 403)
    if not profile["is_active"]:
        raise AppError("FORBIDDEN", "บัญชีนี้ถูกปิดการใช้งาน", 403)

    email = claims.get("email")
    return CurrentUser(
        id=user_id,
        email=email if isinstance(email, str) else None,
        full_name=profile["full_name"],
        role=profile["role"],
    )


def require_roles(*roles: str) -> Callable[..., CurrentUser]:
    """Dependency factory: allow only the given roles, else 403."""
    allowed = frozenset(roles)

    def dependency(
        user: Annotated[CurrentUser, Depends(get_current_user)],
    ) -> CurrentUser:
        if user.role not in allowed:
            raise AppError("FORBIDDEN", "คุณไม่มีสิทธิ์ทำรายการนี้", 403)
        return user

    return dependency
