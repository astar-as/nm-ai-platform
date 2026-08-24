import base64
import hashlib
import logging
from urllib.parse import urlencode

import httpx

from app.config import settings
from app.oauth.base import OAuthProvider, OAuthUser

logger = logging.getLogger(__name__)

_TIMEOUT = httpx.Timeout(10.0)

# Cached OIDC configuration
_oidc_config: dict | None = None

GOOGLE_DISCOVERY_URL = "https://accounts.google.com/.well-known/openid-configuration"


async def _get_oidc_config() -> dict:
    """Fetch and cache the Google OIDC discovery document."""
    global _oidc_config
    if _oidc_config is not None:
        return _oidc_config
    async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
        resp = await client.get(GOOGLE_DISCOVERY_URL)
        resp.raise_for_status()
        _oidc_config = resp.json()
    return _oidc_config


def _compute_code_challenge(code_verifier: str) -> str:
    """Derive S256 code_challenge from code_verifier."""
    digest = hashlib.sha256(code_verifier.encode("ascii")).digest()
    return base64.urlsafe_b64encode(digest).rstrip(b"=").decode("ascii")


class GoogleOAuthProvider(OAuthProvider):
    async def _discover(self) -> dict:
        return await _get_oidc_config()

    async def get_authorize_url(self, state: str, code_verifier: str) -> str:
        oidc = await self._discover()
        authorize_url = oidc["authorization_endpoint"]
        code_challenge = _compute_code_challenge(code_verifier)
        params = {
            "client_id": settings.google_client_id,
            "response_type": "code",
            "scope": "openid email profile",
            "state": state,
            "redirect_uri": settings.google_redirect_uri,
            "code_challenge": code_challenge,
            "code_challenge_method": "S256",
            "access_type": "offline",
            "prompt": "select_account",
        }
        return f"{authorize_url}?{urlencode(params)}"

    async def exchange_code(self, code: str, code_verifier: str) -> dict:
        oidc = await self._discover()
        token_url = oidc["token_endpoint"]
        async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
            resp = await client.post(
                token_url,
                data={
                    "grant_type": "authorization_code",
                    "code": code,
                    "redirect_uri": settings.google_redirect_uri,
                    "client_id": settings.google_client_id,
                    "client_secret": settings.google_client_secret,
                    "code_verifier": code_verifier,
                },
            )
            resp.raise_for_status()
            return resp.json()

    async def get_user_info(self, tokens: dict) -> OAuthUser:
        oidc = await self._discover()
        userinfo_url = oidc["userinfo_endpoint"]
        access_token = tokens["access_token"]
        async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
            resp = await client.get(
                userinfo_url,
                headers={"Authorization": f"Bearer {access_token}"},
            )
            resp.raise_for_status()
            data = resp.json()

        sub = data.get("sub")
        email = data.get("email")
        if not sub or not email:
            raise ValueError(f"Missing required claims from userinfo: sub={bool(sub)}, email={bool(email)}")
        if data.get("email_verified") is not True:
            raise ValueError("Google account email is not verified")

        return OAuthUser(
            provider="google",
            provider_user_id=sub,
            email=email,
            name=data.get("name", email),
            avatar_url=data.get("picture"),
        )
