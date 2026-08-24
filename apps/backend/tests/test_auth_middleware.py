"""Tests for auth middleware / get_current_user dependency (app/dependencies.py).

The updated get_current_user:
1. Checks for Bearer token in Authorization header
2. Decodes JWT
3. Looks up user in DB by payload["sub"]
4. Returns user dict or raises 401
"""

from app.auth import create_access_token
from tests.conftest import make_expired_token, make_mock_record


class TestMissingAuthHeader:
    async def test_no_header_returns_401(self, client):
        resp = await client.get("/teams/my")
        assert resp.status_code == 401

    async def test_no_header_error_detail(self, client):
        resp = await client.get("/teams/my")
        assert resp.json()["detail"] == "Missing token"

    async def test_empty_authorization_header(self, client):
        resp = await client.get("/teams/my", headers={"Authorization": ""})
        assert resp.status_code == 401

    async def test_non_bearer_scheme(self, client):
        resp = await client.get("/teams/my", headers={"Authorization": "Basic abc123"})
        assert resp.status_code == 401
        assert resp.json()["detail"] == "Missing token"

    async def test_bearer_without_token(self, client):
        """'Bearer ' with nothing after it should still fail."""
        resp = await client.get("/teams/my", headers={"Authorization": "Bearer "})
        assert resp.status_code == 401


class TestInvalidToken:
    async def test_expired_token_returns_401(self, client):
        token = make_expired_token("user-1", "user@test.com")
        resp = await client.get("/teams/my", headers={"Authorization": f"Bearer {token}"})
        assert resp.status_code == 401
        assert resp.json()["detail"] == "Invalid token"

    async def test_garbage_token_returns_401(self, client):
        resp = await client.get("/teams/my", headers={"Authorization": "Bearer not.a.jwt"})
        assert resp.status_code == 401
        assert resp.json()["detail"] == "Invalid token"

    async def test_tampered_token_returns_401(self, client):
        token = create_access_token("user-1", "user@test.com")
        tampered = token[:-5] + "XXXXX"
        resp = await client.get("/teams/my", headers={"Authorization": f"Bearer {tampered}"})
        assert resp.status_code == 401


class TestValidToken:
    async def test_valid_token_passes_middleware(self, client, auth_headers, mock_db_pool, test_user_id):
        """With a valid token and user in DB, middleware should pass (not 401).

        get_current_user now looks up the user in the DB, so we need to
        return a mock user record for the first fetchrow call. Subsequent
        fetchrow calls (e.g. team lookups) return None.
        """
        user_record = make_mock_record(
            id=test_user_id,
            email="testuser@example.com",
            name="Test User",
            avatar_url=None,
            auth_provider="google",
        )
        # fetchrow calls: user lookup, ban lookup, then endpoint lookups
        mock_db_pool.fetchrow.side_effect = [user_record, None, None, None]
        resp = await client.get("/teams/my", headers=auth_headers)
        # Should not be 401 - the middleware passed
        assert resp.status_code != 401

    async def test_user_not_in_db_returns_401(self, client, auth_headers, mock_db_pool):
        """Valid JWT but user deleted from DB should return 401."""
        mock_db_pool.fetchrow.return_value = None
        resp = await client.get("/teams/my", headers=auth_headers)
        assert resp.status_code == 401
        assert resp.json()["detail"] == "Invalid token"


class TestHealthEndpointNoAuth:
    async def test_health_does_not_require_auth(self, client):
        """Health endpoint should work without any auth."""
        resp = await client.get("/health")
        assert resp.status_code == 200
