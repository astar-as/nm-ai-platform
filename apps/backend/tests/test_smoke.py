"""Smoke test to verify test infrastructure works."""


async def test_health_endpoint(client):
    resp = await client.get("/health")
    assert resp.status_code == 200
    assert resp.json() == {"status": "ok"}


async def test_auth_token_fixture(auth_token):
    assert isinstance(auth_token, str)
    assert len(auth_token) > 0


async def test_auth_headers_fixture(auth_headers):
    assert "Authorization" in auth_headers
    assert auth_headers["Authorization"].startswith("Bearer ")


async def test_mock_db_connection(mock_db_pool):
    result = await mock_db_pool.fetchrow("SELECT 1")
    assert result is None  # default mock return
    mock_db_pool.fetchrow.assert_called_once()
