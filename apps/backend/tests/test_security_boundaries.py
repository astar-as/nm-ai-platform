import base64
from datetime import datetime, timedelta, timezone
from unittest.mock import patch
from uuid import uuid4

import pytest

from app.auth import create_access_token
from app.config import Settings
from app.main import _validate_mock_auth_config
from app.security import (
    decrypt_submission_secret,
    encrypt_submission_secret,
    normalize_https_url,
)
from tests.conftest import make_mock_record


@pytest.mark.parametrize(
    "value",
    [
        "http://example.com/predict",
        "https://user:pass@example.com/predict",
        "https://example.com/predict#fragment",
        "https://example.com:bad/predict",
        "relative/path",
    ],
)
def test_endpoint_url_rejects_unsafe_forms(value):
    with pytest.raises(ValueError):
        normalize_https_url(value)


def test_endpoint_url_normalizes_absolute_https_url():
    assert normalize_https_url("  https://example.com  ") == "https://example.com/"


def test_submission_secret_is_encrypted_and_round_trips():
    encrypted = encrypt_submission_secret("participant-secret")
    assert encrypted.startswith("enc:v1:")
    assert "participant-secret" not in encrypted
    assert decrypt_submission_secret(encrypted) == "participant-secret"


def test_submission_secret_refuses_plaintext():
    with pytest.raises(ValueError):
        decrypt_submission_secret("participant-secret")


def test_mock_auth_is_rejected_on_non_loopback_hosts():
    unsafe = Settings(
        allow_mock_auth=True,
        allow_insecure_http=True,
        frontend_url="https://public.example",
        backend_url="https://api.public.example",
    )
    with patch("app.main.settings", unsafe), pytest.raises(RuntimeError):
        _validate_mock_auth_config()


async def test_cookie_write_requires_frontend_origin(client):
    client.cookies.set("access_token", "present")
    response = await client.post("/auth/logout")
    assert response.status_code == 403

    response = await client.post(
        "/auth/logout",
        headers={"Origin": "http://localhost:3003"},
    )
    assert response.status_code == 204


async def test_malformed_origin_is_rejected_without_server_error(client):
    client.cookies.set("access_token", "present")
    response = await client.post(
        "/auth/logout",
        headers={"Origin": "https://example.com:bad"},
    )
    assert response.status_code == 403


async def test_personal_token_cannot_mint_another_token(client, mock_db_pool):
    user_id = uuid4()
    api_token_id = uuid4()
    mock_db_pool.fetchrow.side_effect = [
        make_mock_record(
            id=user_id,
            email="participant@example.com",
            name="Participant",
            avatar_url=None,
            auth_provider="magic",
            is_admin=False,
            api_token_id=api_token_id,
        ),
        None,
    ]
    client.cookies.set("access_token", "cmp_personal-token-value")
    response = await client.post(
        "/auth/tokens",
        headers={"Origin": "http://localhost:3003"},
        json={"name": "nested", "expires_in_days": 1},
    )
    assert response.status_code == 403


async def test_browser_session_can_create_one_time_personal_token(client, mock_db_pool):
    user_id = uuid4()
    token_id = uuid4()
    expires_at = datetime.now(timezone.utc) + timedelta(days=1)
    mock_db_pool.fetchrow.side_effect = [
        make_mock_record(
            id=user_id,
            email="participant@example.com",
            name="Participant",
            avatar_url=None,
            auth_provider="magic",
            is_admin=False,
        ),
        None,
        make_mock_record(
            id=token_id,
            name="local client",
            token_hint="cmp_abcd...wxyz",
            expires_at=expires_at,
        ),
    ]
    browser_token = create_access_token(str(user_id), "participant@example.com")
    client.cookies.set("access_token", browser_token)
    response = await client.post(
        "/auth/tokens",
        headers={"Origin": "http://localhost:3003"},
        json={"name": "local client", "expires_in_days": 1},
    )
    assert response.status_code == 201
    body = response.json()
    assert body["token"].startswith("cmp_")
    assert mock_db_pool.fetchrow.call_args_list[-1].args[3] != body["token"]


def test_test_key_is_exactly_32_bytes():
    # Guards the fixture used by the round-trip test from silently drifting.
    from tests.conftest import TEST_SETTINGS

    assert len(base64.urlsafe_b64decode(TEST_SETTINGS.submission_secret_key)) == 32
