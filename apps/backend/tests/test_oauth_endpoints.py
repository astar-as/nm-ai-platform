"""Tests for OAuth endpoints (app/routers/auth.py).

Covers:
- GET /auth/login — OAuth login redirect
- GET /auth/callback — OAuth callback flow
- POST /auth/mock — Mock login (dev only)
- POST /auth/logout
"""

import uuid
from unittest.mock import AsyncMock, patch
from urllib.parse import parse_qs, urlparse

from app.oauth.base import OAuthUser
from tests.conftest import TEST_SETTINGS, make_mock_record

# ---------------------------------------------------------------------------
# GET /auth/login
# ---------------------------------------------------------------------------

class TestOAuthLogin:
    async def test_unsupported_provider_returns_400(self, client):
        resp = await client.get("/auth/login", params={"provider": "facebook"})
        assert resp.status_code == 400
        assert "Unsupported provider" in resp.json()["detail"]

    async def test_missing_provider_returns_422(self, client):
        resp = await client.get("/auth/login")
        assert resp.status_code == 422

    async def test_login_redirects_to_authorize_url(self, client, mock_db_pool):
        """Successful login should store state in DB and redirect to provider."""
        mock_authorize_url = "https://accounts.example.com/authorize?test=1"

        with patch("app.routers.auth.PROVIDERS") as mock_providers:
            mock_oauth = AsyncMock()
            mock_oauth.get_authorize_url = AsyncMock(return_value=mock_authorize_url)
            mock_providers.__contains__ = lambda self, k: k == "google"
            mock_providers.__getitem__ = lambda self, k: mock_oauth

            resp = await client.get(
                "/auth/login",
                params={"provider": "google"},
                follow_redirects=False,
            )

        assert resp.status_code == 302
        assert resp.headers["location"] == mock_authorize_url
        # Verify state was stored in DB
        mock_db_pool.execute.assert_called_once()
        call_args = mock_db_pool.execute.call_args[0]
        assert "INSERT INTO oauth_states" in call_args[0]

    async def test_login_stores_state_and_pkce_data(self, client, mock_db_pool):
        """The state, code_verifier, code_challenge, provider, and redirect_uri should be stored."""
        with patch("app.routers.auth.PROVIDERS") as mock_providers:
            mock_oauth = AsyncMock()
            mock_oauth.get_authorize_url = AsyncMock(return_value="https://example.com/auth")
            mock_providers.__contains__ = lambda self, k: k == "google"
            mock_providers.__getitem__ = lambda self, k: mock_oauth

            await client.get(
                "/auth/login",
                params={"provider": "google"},
                follow_redirects=False,
            )

        call_args = mock_db_pool.execute.call_args[0]
        # Args: query, state, code_verifier, code_challenge, provider, redirect_uri
        assert len(call_args) == 6
        state = call_args[1]
        code_verifier = call_args[2]
        code_challenge = call_args[3]
        provider = call_args[4]
        redirect_uri = call_args[5]

        assert isinstance(state, str) and len(state) > 10
        assert isinstance(code_verifier, str) and len(code_verifier) >= 43
        assert isinstance(code_challenge, str) and len(code_challenge) > 10
        assert provider == "google"
        assert redirect_uri == TEST_SETTINGS.google_redirect_uri


# ---------------------------------------------------------------------------
# GET /auth/callback
# ---------------------------------------------------------------------------

class TestOAuthCallback:
    async def test_provider_error_redirects_to_frontend(self, client):
        """When provider returns an error, redirect to frontend with generic error."""
        resp = await client.get(
            "/auth/callback",
            params={"error": "access_denied", "error_description": "User cancelled"},
            follow_redirects=False,
        )
        assert resp.status_code == 302
        location = resp.headers["location"]
        assert location.startswith(f"{TEST_SETTINGS.frontend_url}/auth/callback")
        parsed = parse_qs(urlparse(location).query)
        assert "error" in parsed

    async def test_provider_error_does_not_leak_details(self, client):
        """Provider error details should not be exposed to the frontend."""
        resp = await client.get(
            "/auth/callback",
            params={"error": "server_error", "error_description": "Internal DB crash"},
            follow_redirects=False,
        )
        location = resp.headers["location"]
        parsed = parse_qs(urlparse(location).query)
        error_msg = parsed["error"][0]
        # Should not contain the raw error_description
        assert "Internal DB crash" not in error_msg

    async def test_missing_code_redirects_with_error(self, client):
        resp = await client.get(
            "/auth/callback",
            params={"state": "some-state"},
            follow_redirects=False,
        )
        assert resp.status_code == 302
        location = resp.headers["location"]
        parsed = parse_qs(urlparse(location).query)
        assert "Missing code or state" in parsed["error"][0]

    async def test_missing_state_redirects_with_error(self, client):
        resp = await client.get(
            "/auth/callback",
            params={"code": "some-code"},
            follow_redirects=False,
        )
        assert resp.status_code == 302
        location = resp.headers["location"]
        parsed = parse_qs(urlparse(location).query)
        assert "Missing code or state" in parsed["error"][0]

    async def test_invalid_state_redirects_with_error(self, client, mock_db_pool):
        """When state is not found in DB (expired or invalid), redirect with error."""
        # First execute call = cleanup, fetchrow = state lookup returns None
        mock_db_pool.fetchrow.return_value = None
        resp = await client.get(
            "/auth/callback",
            params={"code": "auth-code", "state": "invalid-state"},
            follow_redirects=False,
        )
        assert resp.status_code == 302
        location = resp.headers["location"]
        parsed = parse_qs(urlparse(location).query)
        assert "Invalid or expired state" in parsed["error"][0]

    async def test_successful_callback_redirects_with_token(self, client, mock_db_pool):
        """Full happy-path: valid state, exchange code, get user info, issue JWT."""
        user_id = str(uuid.uuid4())

        # fetchrow returns the oauth_states record
        state_record = make_mock_record(
            code_verifier="test-verifier-12345",
            provider="google",
        )
        mock_db_pool.fetchrow.return_value = state_record
        mock_db_pool.fetchval.return_value = user_id

        mock_oauth_user = OAuthUser(
            provider="google",
            provider_user_id="google-sub-123",
            email="test@example.com",
            name="Test Google User",
        )

        with patch("app.routers.auth.PROVIDERS") as mock_providers:
            mock_oauth = AsyncMock()
            mock_oauth.exchange_code = AsyncMock(
                return_value={"access_token": "google-access-token-xyz"}
            )
            mock_oauth.get_user_info = AsyncMock(return_value=mock_oauth_user)
            mock_providers.get = lambda k, d=None: mock_oauth if k == "google" else d

            resp = await client.get(
                "/auth/callback",
                params={"code": "auth-code-123", "state": "valid-state"},
                follow_redirects=False,
            )

        assert resp.status_code == 302
        location = resp.headers["location"]
        assert location.startswith(f"{TEST_SETTINGS.frontend_url}/auth/callback")
        token = resp.cookies.get("access_token")
        assert token is not None
        assert token.count(".") == 2  # JWT has 3 parts

    async def test_callback_upserts_user_in_db(self, client, mock_db_pool):
        """Verify the callback inserts/updates the user in the database."""
        state_record = make_mock_record(
            code_verifier="test-verifier",
            provider="google",
        )
        mock_db_pool.fetchrow.return_value = state_record
        mock_db_pool.fetchval.return_value = str(uuid.uuid4())

        mock_oauth_user = OAuthUser(
            provider="google",
            provider_user_id="google-sub-456",
            email="new@example.com",
            name="New User",
            avatar_url="https://example.com/avatar.png",
        )

        with patch("app.routers.auth.PROVIDERS") as mock_providers:
            mock_oauth = AsyncMock()
            mock_oauth.exchange_code = AsyncMock(
                return_value={"access_token": "token"}
            )
            mock_oauth.get_user_info = AsyncMock(return_value=mock_oauth_user)
            mock_providers.get = lambda k, d=None: mock_oauth if k == "google" else d

            await client.get(
                "/auth/callback",
                params={"code": "code", "state": "state"},
                follow_redirects=False,
            )

        # Verify user upsert was called (other fetchval calls: existing-user check, is_admin lookup)
        upsert_calls = [
            c[0] for c in mock_db_pool.fetchval.call_args_list
            if "INSERT INTO users" in c[0][0]
        ]
        assert len(upsert_calls) == 1
        upsert_args = upsert_calls[0]
        assert "ON CONFLICT" in upsert_args[0]
        assert upsert_args[1] == "new@example.com"
        assert upsert_args[2] == "New User"

    async def test_callback_exchange_failure_redirects_with_error(self, client, mock_db_pool):
        """When code exchange fails, redirect to frontend with error."""
        state_record = make_mock_record(
            code_verifier="test-verifier",
            provider="google",
        )
        mock_db_pool.fetchrow.return_value = state_record

        with patch("app.routers.auth.PROVIDERS") as mock_providers:
            mock_oauth = AsyncMock()
            mock_oauth.exchange_code = AsyncMock(side_effect=Exception("Token exchange failed"))
            mock_providers.get = lambda k, d=None: mock_oauth if k == "google" else d

            resp = await client.get(
                "/auth/callback",
                params={"code": "bad-code", "state": "state"},
                follow_redirects=False,
            )

        assert resp.status_code == 302
        location = resp.headers["location"]
        parsed = parse_qs(urlparse(location).query)
        assert "error" in parsed
        assert "Authentication failed" in parsed["error"][0]

    async def test_state_consumed_on_use(self, client, mock_db_pool):
        """The oauth_states row should be deleted (consumed) during validation."""
        state_record = make_mock_record(
            code_verifier="test-verifier",
            provider="google",
        )
        mock_db_pool.fetchrow.return_value = state_record
        mock_db_pool.fetchval.return_value = str(uuid.uuid4())

        with patch("app.routers.auth.PROVIDERS") as mock_providers:
            mock_oauth = AsyncMock()
            mock_oauth.exchange_code = AsyncMock(return_value={"access_token": "t"})
            mock_oauth.get_user_info = AsyncMock(
                return_value=OAuthUser(
                    provider="google",
                    provider_user_id="sub",
                    email="e@e.com",
                    name="N",
                )
            )
            mock_providers.get = lambda k, d=None: mock_oauth if k == "google" else d

            await client.get(
                "/auth/callback",
                params={"code": "c", "state": "s"},
                follow_redirects=False,
            )

        # The fetchrow query should use DELETE to consume the state
        fetchrow_query = mock_db_pool.fetchrow.call_args[0][0]
        assert "DELETE FROM oauth_states" in fetchrow_query

    async def test_callback_cleans_expired_states(self, client, mock_db_pool):
        """The callback should opportunistically clean up expired states."""
        mock_db_pool.fetchrow.return_value = None  # invalid state

        await client.get(
            "/auth/callback",
            params={"code": "c", "state": "s"},
            follow_redirects=False,
        )

        # The first execute call should be the cleanup
        cleanup_call = mock_db_pool.execute.call_args_list[0]
        assert "DELETE FROM oauth_states WHERE expires_at" in cleanup_call[0][0]

    async def test_callback_passes_tokens_dict_to_get_user_info(self, client, mock_db_pool):
        """get_user_info should receive the full tokens dict from exchange_code."""
        state_record = make_mock_record(code_verifier="v", provider="google")
        mock_db_pool.fetchrow.return_value = state_record
        mock_db_pool.fetchval.return_value = str(uuid.uuid4())

        tokens_response = {"access_token": "at", "id_token": "idt", "token_type": "bearer"}

        with patch("app.routers.auth.PROVIDERS") as mock_providers:
            mock_oauth = AsyncMock()
            mock_oauth.exchange_code = AsyncMock(return_value=tokens_response)
            mock_oauth.get_user_info = AsyncMock(
                return_value=OAuthUser(
                    provider="google", provider_user_id="s", email="e@e.com", name="N"
                )
            )
            mock_providers.get = lambda k, d=None: mock_oauth if k == "google" else d

            await client.get(
                "/auth/callback",
                params={"code": "c", "state": "s"},
                follow_redirects=False,
            )

            # get_user_info should receive the full tokens dict
            mock_oauth.get_user_info.assert_called_once_with(tokens_response)


# ---------------------------------------------------------------------------
# POST /auth/mock
# ---------------------------------------------------------------------------

class TestMockLogin:
    async def test_mock_login_creates_new_user(self, client, mock_db_pool):
        """When user doesn't exist, mock login should create one."""
        new_user_id = str(uuid.uuid4())
        mock_db_pool.fetchrow.return_value = None  # user not found
        mock_db_pool.fetchval.return_value = new_user_id

        resp = await client.post(
            "/auth/mock",
            json={"email": "new@test.com", "name": "New User"},
        )

        assert resp.status_code == 200
        data = resp.json()
        assert "access_token" in data
        assert data["token_type"] == "bearer"
        # Verify INSERT was called (a second fetchval fetches is_admin)
        insert_calls = [
            c[0][0] for c in mock_db_pool.fetchval.call_args_list
            if "INSERT INTO users" in c[0][0]
        ]
        assert len(insert_calls) == 1

    async def test_mock_login_existing_user(self, client, mock_db_pool):
        """When user exists, mock login should reuse the existing user."""
        existing_id = str(uuid.uuid4())
        mock_db_pool.fetchrow.return_value = make_mock_record(
            id=existing_id, email="existing@test.com"
        )

        resp = await client.post(
            "/auth/mock",
            json={"email": "existing@test.com", "name": "Existing"},
        )

        assert resp.status_code == 200
        data = resp.json()
        assert "access_token" in data
        # INSERT should NOT have been called (is_admin lookup still runs)
        assert not any(
            "INSERT INTO users" in c[0][0]
            for c in mock_db_pool.fetchval.call_args_list
        )

    async def test_mock_login_returns_valid_jwt(self, client, mock_db_pool):
        """The access_token from mock login should be a decodable JWT."""
        from app.auth import decode_access_token

        user_id = str(uuid.uuid4())
        mock_db_pool.fetchrow.return_value = None
        mock_db_pool.fetchval.return_value = user_id

        resp = await client.post(
            "/auth/mock",
            json={"email": "jwt@test.com", "name": "JWT Test"},
        )

        token = resp.json()["access_token"]
        payload = decode_access_token(token)
        assert payload is not None
        assert payload["sub"] == user_id
        assert payload["email"] == "jwt@test.com"

    async def test_mock_login_invalid_email_returns_422(self, client):
        resp = await client.post(
            "/auth/mock",
            json={"email": "not-an-email", "name": "Test"},
        )
        assert resp.status_code == 422

    async def test_mock_login_disabled_returns_403(self, client, mock_db_pool):
        """When allow_mock_auth is False, mock login should be forbidden."""
        disabled_settings = TEST_SETTINGS.model_copy(update={"allow_mock_auth": False})
        with patch("app.routers.auth.settings", disabled_settings):
            resp = await client.post(
                "/auth/mock",
                json={"email": "test@test.com", "name": "Test"},
            )
        assert resp.status_code == 403
        assert "disabled" in resp.json()["detail"].lower()


# ---------------------------------------------------------------------------
# POST /auth/logout
# ---------------------------------------------------------------------------

class TestLogout:
    async def test_logout_returns_204(self, client):
        resp = await client.post("/auth/logout")
        assert resp.status_code == 204


# ---------------------------------------------------------------------------
# Full integration test (mock external provider)
# ---------------------------------------------------------------------------

class TestOAuthIntegration:
    async def test_full_oauth_flow(self, client, mock_db_pool):
        """End-to-end: login redirect -> callback -> JWT issued.

        Simulates a complete OAuth flow by:
        1. Calling /auth/login to get the redirect URL
        2. Simulating the callback with a valid code and state
        3. Verifying a JWT is issued for the user
        """
        user_id = str(uuid.uuid4())
        captured_state = None
        captured_verifier = None

        # Capture state from the login execute call
        async def capture_execute(query, *args):
            nonlocal captured_state, captured_verifier
            if "INSERT INTO oauth_states" in query:
                captured_state = args[0]
                captured_verifier = args[1]

        mock_db_pool.execute.side_effect = capture_execute

        mock_authorize_url = "https://accounts.example.com/authorize"

        with patch("app.routers.auth.PROVIDERS") as mock_providers:
            mock_oauth = AsyncMock()
            mock_oauth.get_authorize_url = AsyncMock(return_value=mock_authorize_url)
            mock_oauth.exchange_code = AsyncMock(
                return_value={"access_token": "provider-token"}
            )
            mock_oauth.get_user_info = AsyncMock(
                return_value=OAuthUser(
                    provider="google",
                    provider_user_id="google-unique-id",
                    email="integration@test.com",
                    name="Integration User",
                )
            )
            mock_providers.__contains__ = lambda self, k: k == "google"
            mock_providers.__getitem__ = lambda self, k: mock_oauth
            mock_providers.get = lambda k, d=None: mock_oauth if k == "google" else d

            # Step 1: Login redirect
            login_resp = await client.get(
                "/auth/login",
                params={"provider": "google"},
                follow_redirects=False,
            )
            assert login_resp.status_code == 302
            assert captured_state is not None

            # Step 2: Reset execute side_effect for callback cleanup call
            mock_db_pool.execute.side_effect = None
            mock_db_pool.execute.reset_mock()

            # Simulate the callback: state found in DB
            mock_db_pool.fetchrow.return_value = make_mock_record(
                code_verifier=captured_verifier,
                provider="google",
            )
            mock_db_pool.fetchval.return_value = user_id

            callback_resp = await client.get(
                "/auth/callback",
                params={"code": "authorization-code", "state": captured_state},
                follow_redirects=False,
            )

        # Step 3: Verify JWT was issued
        assert callback_resp.status_code == 302
        token = callback_resp.cookies.get("access_token")
        assert token is not None

        from app.auth import decode_access_token
        payload = decode_access_token(token)
        assert payload is not None
        assert payload["sub"] == user_id
        assert payload["email"] == "integration@test.com"

        # Verify exchange_code was called with the captured code_verifier
        mock_oauth.exchange_code.assert_called_once_with("authorization-code", captured_verifier)
