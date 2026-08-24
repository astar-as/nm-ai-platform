import logging
from datetime import datetime, timezone
from urllib.parse import urlsplit

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse

from app.auth import create_access_token, decode_access_token
from app.config import settings

logger = logging.getLogger(__name__)


class BrowserOriginMiddleware(BaseHTTPMiddleware):
    """Require the configured frontend Origin for cookie-authenticated writes."""

    async def dispatch(self, request: Request, call_next):
        unsafe = request.method.upper() in {"POST", "PUT", "PATCH", "DELETE"}
        cookie_auth = bool(request.cookies.get("access_token"))
        if unsafe and cookie_auth:
            origin = request.headers.get("origin")
            expected = _origin(settings.frontend_url)
            if not origin or _origin(origin) != expected:
                return JSONResponse({"detail": "Invalid request origin"}, status_code=403)
        return await call_next(request)


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        response = await call_next(request)
        response.headers.setdefault("X-Content-Type-Options", "nosniff")
        response.headers.setdefault("X-Frame-Options", "DENY")
        response.headers.setdefault("Referrer-Policy", "no-referrer")
        response.headers.setdefault("Cache-Control", "no-store")
        if settings.cookie_secure:
            response.headers.setdefault("Strict-Transport-Security", "max-age=31536000; includeSubDomains")
        return response


def _origin(value: str) -> tuple[str, str, int] | None:
    try:
        parsed = urlsplit(value)
        port = parsed.port
    except ValueError:
        return None
    scheme = parsed.scheme.lower()
    host = (parsed.hostname or "").lower()
    if scheme not in {"http", "https"} or not host or parsed.username or parsed.password:
        return None
    return scheme, host, port or (443 if scheme == "https" else 80)


class TokenRefreshMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        response = await call_next(request)

        try:
            if response.status_code == 401:
                return response

            token = request.cookies.get("access_token")
            if not token:
                return response

            payload = decode_access_token(token)
            if not payload:
                return response

            exp = datetime.fromtimestamp(payload["exp"], tz=timezone.utc)
            now = datetime.now(timezone.utc)
            remaining = (exp - now).total_seconds()
            max_lifetime = settings.jwt_expire_minutes * 60

            if remaining < max_lifetime * 0.5:
                new_token = create_access_token(
                    payload["sub"],
                    payload["email"],
                    is_admin=payload.get("is_admin", False),
                )
                response.set_cookie(
                    key="access_token",
                    value=new_token,
                    max_age=settings.jwt_expire_minutes * 60,
                    httponly=True,
                    secure=settings.cookie_secure,
                    samesite="lax",
                    domain=settings.cookie_domain,
                    path="/",
                )
                logger.debug("Refreshed JWT for user %s", payload["sub"])
        except Exception:
            logger.debug("Token refresh skipped for %s", request.url.path)

        return response
