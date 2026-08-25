"""Shared test fixtures for backend tests.

Provides:
- AsyncClient configured with ASGITransport for FastAPI testing
- Mock database connection/pool that avoids real PostgreSQL
- Test user and JWT token factories
"""

from __future__ import annotations

import base64
import uuid
from contextlib import asynccontextmanager
from datetime import datetime, timedelta, timezone
from typing import Any
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from httpx import ASGITransport, AsyncClient

from app.auth import JWT_ALGORITHM, create_access_token
from app.config import Settings

# ---------------------------------------------------------------------------
# Settings override – deterministic JWT secret for tests
# ---------------------------------------------------------------------------

TEST_SETTINGS = Settings(
    database_url="postgresql://test:test@localhost:5432/test",
    jwt_secret="test-secret-key-not-for-production-32-bytes-minimum",
    jwt_expire_minutes=60,
    google_client_id="test-client-id",
    google_client_secret="test-client-secret",
    google_redirect_uri="http://localhost:8003/auth/callback",
    allow_mock_auth=True,
    allow_insecure_http=True,
    frontend_url="http://localhost:3003",
    backend_url="http://localhost:8003",
    submission_secret_key=base64.urlsafe_b64encode(b"s" * 32).decode(),
)


@pytest.fixture(autouse=True)
def _override_settings():
    """Patch global settings for every test."""
    with patch("app.config.settings", TEST_SETTINGS), \
         patch("app.auth.settings", TEST_SETTINGS), \
         patch("app.routers.auth.settings", TEST_SETTINGS), \
         patch("app.middleware.settings", TEST_SETTINGS), \
         patch("app.security.settings", TEST_SETTINGS):
        yield


# ---------------------------------------------------------------------------
# Mock database fixtures
# ---------------------------------------------------------------------------

class MockRecord(dict):
    """Dict subclass that supports both attribute and key access like asyncpg.Record."""

    def __getattr__(self, key: str) -> Any:
        try:
            return self[key]
        except KeyError:
            raise AttributeError(key)


class MockConnection:
    """Mock asyncpg connection with common query methods."""

    def __init__(self) -> None:
        self.fetchrow = AsyncMock(return_value=None)
        self.fetchval = AsyncMock(return_value=None)
        self.fetch = AsyncMock(return_value=[])
        self.execute = AsyncMock(return_value="UPDATE 1")

    def reset(self) -> None:
        self.fetchrow.reset_mock()
        self.fetchval.reset_mock()
        self.fetch.reset_mock()
        self.execute.reset_mock()

    @asynccontextmanager
    async def transaction(self):
        yield


@pytest.fixture()
def mock_conn():
    """Provide a fresh MockConnection for each test."""
    return MockConnection()


@pytest.fixture()
def mock_db_pool(mock_conn: MockConnection):
    """Patch app.db.pool so get_db yields our mock connection."""
    pool = MagicMock()
    # Make pool.acquire() return an async context manager yielding mock_conn
    acm = AsyncMock()
    acm.__aenter__ = AsyncMock(return_value=mock_conn)
    acm.__aexit__ = AsyncMock(return_value=False)
    pool.acquire.return_value = acm

    with patch("app.db.pool", pool):
        yield mock_conn


# ---------------------------------------------------------------------------
# HTTP client fixture
# ---------------------------------------------------------------------------

@pytest.fixture()
async def client(mock_db_pool):
    """AsyncClient wired to the FastAPI app, with DB mocked out.

    Uses ASGITransport so no real server is started.
    The lifespan is disabled to avoid real DB pool init.
    """
    from app.main import app

    # Disable lifespan so we don't try to connect to a real database
    app.router.lifespan_context = _null_lifespan

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac


@asynccontextmanager
async def _null_lifespan(app):
    yield


# ---------------------------------------------------------------------------
# User / token factories
# ---------------------------------------------------------------------------

@pytest.fixture()
def test_user_id() -> str:
    return str(uuid.uuid4())


@pytest.fixture()
def test_user_email() -> str:
    return "testuser@example.com"


@pytest.fixture()
def test_user(test_user_id, test_user_email) -> dict:
    return {
        "id": test_user_id,
        "email": test_user_email,
        "name": "Test User",
        "auth_provider": "google",
        "auth_provider_id": "google-12345",
    }


@pytest.fixture()
def auth_token(test_user_id, test_user_email) -> str:
    """A valid JWT for the test user."""
    return create_access_token(test_user_id, test_user_email)


@pytest.fixture()
def auth_headers(auth_token) -> dict[str, str]:
    """Authorization header dict ready for use with httpx requests."""
    return {"Authorization": f"Bearer {auth_token}"}


def make_token(user_id: str = "user-1", email: str = "u@test.com", **overrides) -> str:
    """Helper to create tokens with custom claims. For use in test functions directly."""
    return create_access_token(user_id, email)


def make_expired_token(user_id: str = "user-1", email: str = "u@test.com") -> str:
    """Create a JWT that is already expired."""
    import jwt

    payload = {
        "sub": user_id,
        "email": email,
        "iat": datetime.now(timezone.utc) - timedelta(hours=2),
        "nbf": datetime.now(timezone.utc) - timedelta(hours=2),
        "iss": TEST_SETTINGS.jwt_issuer,
        "aud": TEST_SETTINGS.jwt_audience,
        "exp": datetime.now(timezone.utc) - timedelta(hours=1),
    }
    return jwt.encode(payload, TEST_SETTINGS.jwt_secret, algorithm=JWT_ALGORITHM)


def make_mock_record(**kwargs) -> MockRecord:
    """Create a MockRecord (dict-like) simulating an asyncpg row."""
    return MockRecord(**kwargs)
