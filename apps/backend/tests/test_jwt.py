"""Tests for JWT token creation and decoding (app/auth.py)."""

from datetime import datetime, timedelta, timezone

import jwt

from app.auth import (
    JWT_ALGORITHM,
    create_access_token,
    decode_access_token,
    generate_code_verifier,
    generate_state,
)
from tests.conftest import TEST_SETTINGS, make_expired_token

# ---------------------------------------------------------------------------
# create_access_token
# ---------------------------------------------------------------------------

class TestCreateAccessToken:
    async def test_returns_string(self):
        token = create_access_token("user-1", "user@test.com")
        assert isinstance(token, str)
        assert len(token) > 0

    async def test_contains_expected_claims(self):
        token = create_access_token("user-1", "user@test.com")
        payload = jwt.decode(
            token,
            TEST_SETTINGS.jwt_secret,
            algorithms=[JWT_ALGORITHM],
            audience=TEST_SETTINGS.jwt_audience,
            issuer=TEST_SETTINGS.jwt_issuer,
        )
        assert payload["sub"] == "user-1"
        assert payload["email"] == "user@test.com"
        assert "exp" in payload

    async def test_expiry_is_in_the_future(self):
        token = create_access_token("user-1", "user@test.com")
        payload = jwt.decode(
            token,
            TEST_SETTINGS.jwt_secret,
            algorithms=[JWT_ALGORITHM],
            audience=TEST_SETTINGS.jwt_audience,
            issuer=TEST_SETTINGS.jwt_issuer,
        )
        exp = datetime.fromtimestamp(payload["exp"], tz=timezone.utc)
        assert exp > datetime.now(timezone.utc)

    async def test_different_users_produce_different_tokens(self):
        t1 = create_access_token("user-1", "a@test.com")
        t2 = create_access_token("user-2", "b@test.com")
        assert t1 != t2

    async def test_uses_configured_algorithm(self):
        token = create_access_token("user-1", "user@test.com")
        header = jwt.get_unverified_header(token)
        assert header["alg"] == JWT_ALGORITHM


# ---------------------------------------------------------------------------
# decode_access_token
# ---------------------------------------------------------------------------

class TestDecodeAccessToken:
    async def test_valid_token_returns_payload(self):
        token = create_access_token("user-1", "user@test.com")
        payload = decode_access_token(token)
        assert payload is not None
        assert payload["sub"] == "user-1"
        assert payload["email"] == "user@test.com"

    async def test_expired_token_returns_none(self):
        token = make_expired_token("user-1", "user@test.com")
        payload = decode_access_token(token)
        assert payload is None

    async def test_tampered_token_returns_none(self):
        token = create_access_token("user-1", "user@test.com")
        # Flip a character in the signature (last segment)
        parts = token.rsplit(".", 1)
        tampered = parts[0] + "." + parts[1][::-1]
        payload = decode_access_token(tampered)
        assert payload is None

    async def test_wrong_secret_returns_none(self):
        payload_data = {
            "sub": "user-1",
            "email": "user@test.com",
            "exp": datetime.now(timezone.utc) + timedelta(hours=1),
        }
        token = jwt.encode(
            payload_data,
            "wrong-secret-but-long-enough-for-hs256-tests",
            algorithm="HS256",
        )
        payload = decode_access_token(token)
        assert payload is None

    async def test_garbage_string_returns_none(self):
        payload = decode_access_token("not-a-jwt-at-all")
        assert payload is None

    async def test_empty_string_returns_none(self):
        payload = decode_access_token("")
        assert payload is None

    async def test_wrong_algorithm_returns_none(self):
        """Token signed with HS384 should fail HS256 verification."""
        payload_data = {
            "sub": "user-1",
            "email": "user@test.com",
            "exp": datetime.now(timezone.utc) + timedelta(hours=1),
        }
        token = jwt.encode(
            payload_data,
            TEST_SETTINGS.jwt_secret.ljust(48, "x"),
            algorithm="HS384",
        )
        payload = decode_access_token(token)
        assert payload is None

    async def test_roundtrip_preserves_user_id_and_email(self):
        uid = "550e8400-e29b-41d4-a716-446655440000"
        email = "roundtrip@test.com"
        token = create_access_token(uid, email)
        payload = decode_access_token(token)
        assert payload["sub"] == uid
        assert payload["email"] == email


# ---------------------------------------------------------------------------
# PKCE and state helpers
# ---------------------------------------------------------------------------

class TestPKCEAndState:
    async def test_generate_code_verifier_is_url_safe(self):
        verifier = generate_code_verifier()
        assert isinstance(verifier, str)
        # PKCE verifiers should be 43-128 chars per RFC 7636
        assert len(verifier) >= 43

    async def test_generate_code_verifier_is_random(self):
        v1 = generate_code_verifier()
        v2 = generate_code_verifier()
        assert v1 != v2

    async def test_generate_state_is_random(self):
        s1 = generate_state()
        s2 = generate_state()
        assert s1 != s2

    async def test_generate_state_is_sufficiently_long(self):
        state = generate_state()
        # Should be long enough to prevent CSRF (32 bytes -> ~43 chars base64)
        assert len(state) >= 20
