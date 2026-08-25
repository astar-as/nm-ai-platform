import ipaddress
import json
import os
import socket
from contextlib import asynccontextmanager
from urllib.parse import urlparse

import httpx

DEV_MODE = os.getenv("DEV_MODE", "").lower() in ("1", "true", "yes")
ALLOWED_PORTS = {
    int(value)
    for value in os.getenv("ALLOWED_ENDPOINT_PORTS", "443").split(",")
    if value.strip().isdigit()
}


class SSRFError(Exception):
    pass


class PinnedDNSTransport(httpx.AsyncHTTPTransport):
    def __init__(self, hostname: str, pinned_ip: str, port: int = 443, **kwargs):
        self.hostname = hostname
        self.pinned_ip = pinned_ip
        self.port = port
        super().__init__(**kwargs)

    async def handle_async_request(self, request: httpx.Request) -> httpx.Response:
        url = request.url.copy_with(host=self.pinned_ip, port=self.port)
        request = httpx.Request(
            method=request.method,
            url=url,
            headers=request.headers,
            content=request.content,
            extensions={**request.extensions, "sni_hostname": self.hostname},
        )
        return await super().handle_async_request(request)


class SafeHTTPClient:
    BLOCKED_NETWORKS = [
        ipaddress.ip_network("10.0.0.0/8"),
        ipaddress.ip_network("172.16.0.0/12"),
        ipaddress.ip_network("192.168.0.0/16"),
        ipaddress.ip_network("127.0.0.0/8"),
        ipaddress.ip_network("169.254.0.0/16"),
        ipaddress.ip_network("0.0.0.0/8"),
        ipaddress.ip_network("100.64.0.0/10"),
        ipaddress.ip_network("192.0.0.0/24"),
        ipaddress.ip_network("192.0.2.0/24"),
        ipaddress.ip_network("198.51.100.0/24"),
        ipaddress.ip_network("203.0.113.0/24"),
        ipaddress.ip_network("224.0.0.0/4"),
        ipaddress.ip_network("240.0.0.0/4"),
    ]

    BLOCKED_NETWORKS_V6 = [
        ipaddress.ip_network("::1/128"),
        ipaddress.ip_network("fc00::/7"),
        ipaddress.ip_network("fe80::/10"),
        ipaddress.ip_network("::ffff:0:0/96"),
    ]

    def __init__(
        self,
        connect_timeout: float = 5.0,
        read_timeout: float = 30.0,
        max_response_bytes: int = 10 * 1024 * 1024,
    ):
        self.connect_timeout = connect_timeout
        self.read_timeout = read_timeout
        self.max_response_bytes = max_response_bytes

    def _is_blocked_ip(self, ip_str: str) -> bool:
        try:
            ip = ipaddress.ip_address(ip_str)
        except ValueError:
            return True

        if not ip.is_global:
            return True
        networks = self.BLOCKED_NETWORKS if ip.version == 4 else self.BLOCKED_NETWORKS_V6
        for network in networks:
            if ip in network:
                return True
        return False

    def _resolve_and_validate(self, hostname: str) -> str:
        try:
            addresses = {
                info[4][0]
                for info in socket.getaddrinfo(hostname, None, type=socket.SOCK_STREAM)
            }
        except socket.gaierror as e:
            raise SSRFError(f"DNS resolution failed for {hostname}: {e}")
        if not addresses:
            raise SSRFError(f"DNS resolution returned no addresses for {hostname}")
        for address in addresses:
            if self._is_blocked_ip(address):
                raise SSRFError("Hostname resolves to a non-public address")
        return sorted(addresses)[0]

    @asynccontextmanager
    async def create_session(self, url: str):
        try:
            parsed = urlparse(url)
            hostname = parsed.hostname
            port = parsed.port
        except ValueError as exc:
            raise SSRFError("Endpoint URL is invalid") from exc
        scheme = parsed.scheme.lower()
        if scheme not in {"http", "https"} or not hostname:
            raise SSRFError("Endpoint URL must be absolute HTTP(S)")
        if parsed.username or parsed.password:
            raise SSRFError("Endpoint URLs cannot contain credentials")
        if parsed.fragment:
            raise SSRFError("Endpoint URLs cannot contain fragments")

        if DEV_MODE and hostname in ("localhost", "127.0.0.1"):
            async with httpx.AsyncClient(
                timeout=httpx.Timeout(
                    connect=self.connect_timeout,
                    read=self.read_timeout,
                    write=5.0,
                    pool=5.0,
                ),
            ) as client:
                yield client
                return

        if scheme != "https":
            raise SSRFError("Only HTTPS URLs allowed")

        try:
            ipaddress.ip_address(hostname)
            raise SSRFError("IP addresses not allowed, use hostname")
        except ValueError:
            pass

        port = port or 443
        if port not in ALLOWED_PORTS:
            raise SSRFError(f"Endpoint port {port} is not allowed")
        pinned_ip = self._resolve_and_validate(hostname)

        transport = PinnedDNSTransport(
            hostname=hostname,
            pinned_ip=pinned_ip,
            port=port,
        )

        async with httpx.AsyncClient(
            transport=transport,
            timeout=httpx.Timeout(
                connect=self.connect_timeout,
                read=self.read_timeout,
                write=5.0,
                pool=5.0,
            ),
            follow_redirects=False,
            headers={"Host": hostname if port == 443 else f"{hostname}:{port}"},
        ) as client:
            yield client

    async def request_json(
        self,
        method: str,
        url: str,
        *,
        payload: object | None = None,
        headers: dict[str, str] | None = None,
    ) -> object:
        """Send one bounded JSON request through DNS pinning and SSRF checks."""
        request_body = json.dumps(payload, separators=(",", ":")).encode() if payload is not None else None
        safe_headers = {
            key: value
            for key, value in (headers or {}).items()
            if key.lower() not in {"host", "content-length", "transfer-encoding", "connection"}
        }
        safe_headers["Accept"] = "application/json"
        if request_body is not None:
            safe_headers["Content-Type"] = "application/json"

        async with self.create_session(url) as client:
            async with client.stream(
                method.upper(),
                url,
                content=request_body,
                headers=safe_headers,
            ) as response:
                content_length = response.headers.get("content-length")
                if content_length:
                    try:
                        advertised_size = int(content_length)
                    except ValueError as exc:
                        raise SSRFError("Endpoint returned an invalid Content-Length") from exc
                    if advertised_size < 0 or advertised_size > self.max_response_bytes:
                        raise SSRFError("Endpoint response exceeds the configured size limit")
                chunks = []
                size = 0
                async for chunk in response.aiter_bytes():
                    size += len(chunk)
                    if size > self.max_response_bytes:
                        raise SSRFError("Endpoint response exceeds the configured size limit")
                    chunks.append(chunk)
                if not response.is_success:
                    raise SSRFError(f"Endpoint returned HTTP {response.status_code}")

        try:
            return json.loads(b"".join(chunks))
        except (UnicodeDecodeError, json.JSONDecodeError) as exc:
            raise SSRFError("Endpoint did not return valid JSON") from exc
