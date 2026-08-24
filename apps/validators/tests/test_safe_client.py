import socket
from contextlib import asynccontextmanager
from unittest.mock import AsyncMock, patch

import httpx
import pytest
from shared.http.safe_client import PinnedDNSTransport, SafeHTTPClient, SSRFError


def test_rejects_non_public_addresses():
    client = SafeHTTPClient()
    for address in ("127.0.0.1", "169.254.169.254", "10.0.0.1", "::1", "fc00::1"):
        assert client._is_blocked_ip(address)
    assert not client._is_blocked_ip("1.1.1.1")


def test_rejects_hostname_when_any_dns_answer_is_private():
    answers = [
        (socket.AF_INET, socket.SOCK_STREAM, 6, "", ("1.1.1.1", 0)),
        (socket.AF_INET, socket.SOCK_STREAM, 6, "", ("127.0.0.1", 0)),
    ]
    with patch("socket.getaddrinfo", return_value=answers), pytest.raises(SSRFError):
        SafeHTTPClient()._resolve_and_validate("endpoint.example")


@pytest.mark.asyncio
async def test_transport_pins_ip_and_preserves_sni():
    request = httpx.Request(
        "POST",
        "https://endpoint.example/predict",
        headers={"Host": "endpoint.example"},
        content=b"{}",
    )
    response = httpx.Response(200, request=request, json={"ok": True})
    with patch.object(
        httpx.AsyncHTTPTransport,
        "handle_async_request",
        new=AsyncMock(return_value=response),
    ) as parent:
        transport = PinnedDNSTransport("endpoint.example", "1.1.1.1")
        await transport.handle_async_request(request)

    pinned_request = parent.await_args.args[0]
    assert pinned_request.url.host == "1.1.1.1"
    assert pinned_request.headers["host"] == "endpoint.example"
    assert pinned_request.extensions["sni_hostname"] == "endpoint.example"


class MockSessionClient(SafeHTTPClient):
    def __init__(self, handler, **kwargs):
        super().__init__(**kwargs)
        self.handler = handler

    @asynccontextmanager
    async def create_session(self, url: str):
        async with httpx.AsyncClient(transport=httpx.MockTransport(self.handler)) as client:
            yield client


@pytest.mark.asyncio
async def test_response_body_limit_applies_after_decoding():
    def handler(request):
        return httpx.Response(200, content=b"x" * 20, request=request)

    client = MockSessionClient(handler, max_response_bytes=10)
    with pytest.raises(SSRFError, match="size limit"):
        await client.request_json("GET", "https://endpoint.example/predict")


@pytest.mark.asyncio
async def test_redirects_and_non_json_responses_are_rejected():
    redirecting = MockSessionClient(
        lambda request: httpx.Response(302, headers={"Location": "http://127.0.0.1"}, request=request)
    )
    with pytest.raises(SSRFError, match="HTTP 302"):
        await redirecting.request_json("GET", "https://endpoint.example/predict")

    non_json = MockSessionClient(
        lambda request: httpx.Response(200, text="not json", request=request)
    )
    with pytest.raises(SSRFError, match="valid JSON"):
        await non_json.request_json("GET", "https://endpoint.example/predict")


@pytest.mark.asyncio
async def test_unsafe_url_forms_fail_before_connecting():
    client = SafeHTTPClient()
    with patch(
        "socket.getaddrinfo",
        return_value=[(socket.AF_INET, socket.SOCK_STREAM, 6, "", ("1.1.1.1", 0))],
    ):
        for value in (
            "http://endpoint.example/predict",
            "https://user:pass@endpoint.example/predict",
            "https://127.0.0.1/predict",
            "https://endpoint.example:444/predict",
            "https://endpoint.example/predict#fragment",
        ):
            with pytest.raises(SSRFError):
                async with client.create_session(value):
                    pass
