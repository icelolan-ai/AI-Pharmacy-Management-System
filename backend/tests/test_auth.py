"""Unit tests for JWT auth, /api/v1/me and role checks (task 3.5).

No real database, no real login: an ES256 key pair is generated here, tokens
are signed locally, and the JWKS client and profile loader are monkeypatched.
"""

import base64
import hashlib
import hmac
import json
import time
import uuid
from types import SimpleNamespace
from typing import Annotated

import jwt
import pytest
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import ec
from fastapi import Depends, FastAPI
from fastapi.testclient import TestClient

from app import auth
from app.auth import CurrentUser, require_roles
from app.config import get_settings
from app.errors import register_error_handlers
from app.main import app

KID = "test-kid-1"
PRIVATE_KEY = ec.generate_private_key(ec.SECP256R1())
PUBLIC_KEY = PRIVATE_KEY.public_key()
ISSUER = f"{get_settings().supabase_url.rstrip('/')}/auth/v1"

OWNER_ID = uuid.uuid4()
NO_PROFILE_ID = uuid.uuid4()
INACTIVE_ID = uuid.uuid4()
STAFF_ID = uuid.uuid4()

PROFILES = {
    OWNER_ID: {"full_name": "Test Owner", "role": "owner", "is_active": True},
    INACTIVE_ID: {"full_name": "Disabled User", "role": "pharmacist", "is_active": False},
    STAFF_ID: {"full_name": "Test Staff", "role": "staff", "is_active": True},
}


class FakeJWKSClient:
    """Stands in for PyJWKClient: returns the test public key for the known kid."""

    def get_signing_key_from_jwt(self, token):
        header = jwt.get_unverified_header(token)
        if header.get("kid") != KID:
            raise jwt.PyJWKClientError("Unable to find a signing key that matches")
        return SimpleNamespace(key=PUBLIC_KEY)


class UnreachableJWKSClient:
    def get_signing_key_from_jwt(self, token):
        raise jwt.PyJWKClientConnectionError("network down")


@pytest.fixture(autouse=True)
def fake_dependencies(monkeypatch):
    monkeypatch.setattr(auth, "get_jwks_client", lambda: FakeJWKSClient())
    monkeypatch.setattr(auth, "load_user_profile", lambda user_id: PROFILES.get(user_id))


@pytest.fixture
def client():
    # No `with`: the lifespan (database pool) is not started.
    return TestClient(app)


def make_token(
    sub=OWNER_ID,
    *,
    expires_in=3600,
    audience="authenticated",
    issuer=ISSUER,
    email="owner@example.com",
    algorithm="ES256",
    key=None,
    kid=KID,
):
    now = int(time.time())
    payload = {
        "sub": str(sub),
        "aud": audience,
        "iss": issuer,
        "iat": now,
        "exp": now + expires_in,
        "email": email,
        "role": "authenticated",
    }
    signing_key = PRIVATE_KEY if key is None else key
    return jwt.encode(payload, signing_key, algorithm=algorithm, headers={"kid": kid})


def bearer(token):
    return {"Authorization": f"Bearer {token}"}


def assert_error(resp, status, code):
    assert resp.status_code == status, resp.text
    body = resp.json()
    assert set(body) == {"error"}
    assert set(body["error"]) == {"code", "message", "details"}
    assert body["error"]["code"] == code
    assert isinstance(body["error"]["message"], str) and body["error"]["message"]
    return body


# --- a–f: 401 ---------------------------------------------------------------


def test_a_missing_authorization_header_returns_401(client):
    assert_error(client.get("/api/v1/me"), 401, "UNAUTHENTICATED")


def test_b_garbage_bearer_token_returns_401(client):
    assert_error(client.get("/api/v1/me", headers=bearer("abc")), 401, "UNAUTHENTICATED")


def test_c_expired_token_returns_401(client):
    # Expired beyond the 30-second leeway.
    token = make_token(expires_in=-120)
    assert_error(client.get("/api/v1/me", headers=bearer(token)), 401, "UNAUTHENTICATED")


def test_d_wrong_audience_returns_401(client):
    token = make_token(audience="anon")
    assert_error(client.get("/api/v1/me", headers=bearer(token)), 401, "UNAUTHENTICATED")


def test_e_wrong_issuer_returns_401(client):
    token = make_token(issuer="https://evil.example.com/auth/v1")
    assert_error(client.get("/api/v1/me", headers=bearer(token)), 401, "UNAUTHENTICATED")


def test_f_alg_none_returns_401(client):
    token = jwt.encode(
        {
            "sub": str(OWNER_ID),
            "aud": "authenticated",
            "iss": ISSUER,
            "exp": int(time.time()) + 3600,
        },
        None,
        algorithm="none",
        headers={"kid": KID},
    )
    assert_error(client.get("/api/v1/me", headers=bearer(token)), 401, "UNAUTHENTICATED")


def test_f_hs256_returns_401(client):
    token = make_token(algorithm="HS256", key="x" * 64)
    assert_error(client.get("/api/v1/me", headers=bearer(token)), 401, "UNAUTHENTICATED")


def test_f_hs256_signed_with_public_key_returns_401(client):
    # Algorithm-confusion attempt: HMAC using the public key bytes as the secret.
    public_pem = PUBLIC_KEY.public_bytes(
        serialization.Encoding.PEM, serialization.PublicFormat.SubjectPublicKeyInfo
    )
    header = {"alg": "HS256", "typ": "JWT", "kid": KID}
    payload = {
        "sub": str(OWNER_ID),
        "aud": "authenticated",
        "iss": ISSUER,
        "exp": int(time.time()) + 3600,
    }

    def b64(data):
        return base64.urlsafe_b64encode(data).rstrip(b"=")

    signing_input = b64(json.dumps(header).encode()) + b"." + b64(json.dumps(payload).encode())
    signature = b64(hmac.new(public_pem, signing_input, hashlib.sha256).digest())
    token = (signing_input + b"." + signature).decode()
    assert_error(client.get("/api/v1/me", headers=bearer(token)), 401, "UNAUTHENTICATED")


# --- g–h: 403 profile checks ---------------------------------------------------


def test_g_valid_token_without_profile_returns_403(client):
    token = make_token(sub=NO_PROFILE_ID)
    body = assert_error(client.get("/api/v1/me", headers=bearer(token)), 403, "FORBIDDEN")
    assert body["error"]["message"] == "บัญชีนี้ยังไม่ได้รับสิทธิ์ใช้งานระบบ"


def test_h_valid_token_inactive_profile_returns_403(client):
    token = make_token(sub=INACTIVE_ID)
    body = assert_error(client.get("/api/v1/me", headers=bearer(token)), 403, "FORBIDDEN")
    assert body["error"]["message"] == "บัญชีนี้ถูกปิดการใช้งาน"


# --- i: success ----------------------------------------------------------------


def test_i_valid_owner_token_returns_me(client):
    token = make_token(sub=OWNER_ID, email="owner@example.com")
    resp = client.get("/api/v1/me", headers=bearer(token))
    assert resp.status_code == 200, resp.text
    assert resp.json() == {
        "id": str(OWNER_ID),
        "email": "owner@example.com",
        "full_name": "Test Owner",
        "role": "owner",
    }


# --- j: require_roles ------------------------------------------------------------


def _role_test_client():
    """Separate test-only app; nothing is added to the real application."""
    test_app = FastAPI()
    register_error_handlers(test_app)

    @test_app.get("/owner-only")
    def owner_only(user: Annotated[CurrentUser, Depends(require_roles("owner"))]):
        return {"role": user.role}

    return TestClient(test_app)


def test_j_require_owner_with_staff_returns_403():
    role_client = _role_test_client()
    body = assert_error(
        role_client.get("/owner-only", headers=bearer(make_token(sub=STAFF_ID))),
        403,
        "FORBIDDEN",
    )
    assert body["error"]["message"] == "คุณไม่มีสิทธิ์ทำรายการนี้"


def test_j_require_owner_with_owner_returns_200():
    role_client = _role_test_client()
    resp = role_client.get("/owner-only", headers=bearer(make_token(sub=OWNER_ID)))
    assert resp.status_code == 200
    assert resp.json() == {"role": "owner"}


# --- k: central error format for every error case -------------------------------------


def test_k_all_error_responses_use_central_format(client):
    cases = [
        ({}, 401, "UNAUTHENTICATED"),
        (bearer("abc"), 401, "UNAUTHENTICATED"),
        ({"Authorization": "Basic dXNlcjpwYXNz"}, 401, "UNAUTHENTICATED"),
        ({"Authorization": "Bearer"}, 401, "UNAUTHENTICATED"),
        (bearer(make_token(expires_in=-120)), 401, "UNAUTHENTICATED"),
        (bearer(make_token(audience="anon")), 401, "UNAUTHENTICATED"),
        (bearer(make_token(issuer="https://evil.example.com/auth/v1")), 401, "UNAUTHENTICATED"),
        (bearer(make_token(algorithm="HS256", key="x" * 64)), 401, "UNAUTHENTICATED"),
        (bearer(make_token(kid="unknown-kid")), 401, "UNAUTHENTICATED"),
        (bearer(make_token(sub=NO_PROFILE_ID)), 403, "FORBIDDEN"),
        (bearer(make_token(sub=INACTIVE_ID)), 403, "FORBIDDEN"),
    ]
    for headers, status, code in cases:
        assert_error(client.get("/api/v1/me", headers=headers), status, code)
    assert_error(
        _role_test_client().get("/owner-only", headers=bearer(make_token(sub=STAFF_ID))),
        403,
        "FORBIDDEN",
    )


# --- extras ---------------------------------------------------------------------------


def test_extra_jwks_unreachable_returns_503(client, monkeypatch):
    monkeypatch.setattr(auth, "get_jwks_client", lambda: UnreachableJWKSClient())
    assert_error(
        client.get("/api/v1/me", headers=bearer(make_token())), 503, "SERVICE_UNAVAILABLE"
    )


def test_extra_sub_not_uuid_returns_401(client):
    token = make_token(sub="not-a-uuid")
    assert_error(client.get("/api/v1/me", headers=bearer(token)), 401, "UNAUTHENTICATED")


def test_extra_token_within_leeway_is_accepted(client):
    token = make_token(expires_in=-10)
    assert client.get("/api/v1/me", headers=bearer(token)).status_code == 200
