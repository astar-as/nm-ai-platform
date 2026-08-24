import logging
from contextlib import asynccontextmanager
from urllib.parse import urlsplit

from fastapi import FastAPI, HTTPException, Request
from fastapi.exception_handlers import http_exception_handler
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.config import DEV_JWT_SECRET, settings
from app.db import close_pool, init_pool
from app.middleware import (
    BrowserOriginMiddleware,
    SecurityHeadersMiddleware,
    TokenRefreshMiddleware,
)
from app.routers import (
    api_tokens,
    auth,
    certificate,
    code_submissions,
    competitions,
    events,
    feedback,
    finals,
    leaderboard,
    livestream,
    locations,
    submissions,
    tasks,
    teams,
    users,
)

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


def _validate_oauth_config():
    """Warn at startup if OAuth is required but credentials are missing."""
    if not settings.allow_mock_auth:
        if not settings.google_client_id or not settings.google_client_secret:
            raise RuntimeError(
                "OAuth credentials missing: google_client_id and google_client_secret "
                "must be set when allow_mock_auth is False"
            )


def _validate_jwt_secret():
    """Refuse to start with the default dev JWT secret outside of mock-auth dev mode."""
    if not settings.allow_mock_auth and (
        settings.jwt_secret == DEV_JWT_SECRET or len(settings.jwt_secret.encode("utf-8")) < 32
    ):
        raise RuntimeError(
            "JWT_SECRET must be a unique value of at least 32 bytes when mock auth is disabled."
        )


def _validate_transport_config():
    if settings.allow_insecure_http:
        return
    if not settings.frontend_url.startswith("https://") or not settings.backend_url.startswith("https://"):
        raise RuntimeError("FRONTEND_URL and BACKEND_URL must use HTTPS outside local development")
    if not settings.cookie_secure:
        raise RuntimeError("Secure auth cookies are required outside local development")


def _validate_mock_auth_config():
    if not settings.allow_mock_auth:
        return
    frontend_host = urlsplit(settings.frontend_url).hostname
    backend_host = urlsplit(settings.backend_url).hostname
    loopback_hosts = {"localhost", "127.0.0.1", "::1"}
    if not settings.allow_insecure_http or frontend_host not in loopback_hosts or backend_host not in loopback_hosts:
        raise RuntimeError(
            "Mock authentication is restricted to explicitly insecure loopback development"
        )


@asynccontextmanager
async def lifespan(app: FastAPI):
    _validate_oauth_config()
    _validate_jwt_secret()
    _validate_mock_auth_config()
    _validate_transport_config()
    logger.info("Starting up - initializing database pool")
    try:
        await init_pool()
        logger.info("Database pool initialized")
    except Exception as e:
        logger.error(f"Failed to initialize database pool: {e}")
        raise
    yield
    await close_pool()
    logger.info("Database pool closed")


def _create_app() -> FastAPI:
    if not settings.docs_enabled:
        return FastAPI(
            title=settings.app_name,
            version="0.1.0",
            lifespan=lifespan,
            docs_url=None,
            redoc_url=None,
            openapi_url=None,
        )
    return FastAPI(title=settings.app_name, version="0.1.0", lifespan=lifespan)


app = _create_app()


@app.exception_handler(HTTPException)
async def ban_cookie_exception_handler(request: Request, exc: HTTPException):
    if (
        exc.status_code == 403
        and isinstance(exc.detail, dict)
        and exc.detail.get("type") == "banned"
    ):
        response = JSONResponse(
            status_code=403,
            content={"detail": exc.detail},
        )
        response.set_cookie(
            key="user_banned",
            value="1",
            max_age=settings.jwt_expire_minutes * 60,
            httponly=True,
            secure=settings.cookie_secure,
            samesite="lax",
            domain=settings.cookie_domain,
            path="/",
        )
        return response
    return await http_exception_handler(request, exc)


app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.frontend_url],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.add_middleware(TokenRefreshMiddleware)
app.add_middleware(BrowserOriginMiddleware)
app.add_middleware(SecurityHeadersMiddleware)


app.include_router(auth.router, prefix="/auth", tags=["Auth"])
app.include_router(api_tokens.router, prefix="/auth/tokens", tags=["Auth"])
app.include_router(users.router, prefix="/users", tags=["Users"])
app.include_router(competitions.router, prefix="/competitions", tags=["Competitions"])
app.include_router(teams.router, prefix="/teams", tags=["Teams"])
app.include_router(tasks.router, prefix="/tasks", tags=["Tasks"])
app.include_router(submissions.router, prefix="/tasks", tags=["Submissions"])
app.include_router(submissions.submission_detail_router, prefix="/submissions", tags=["Submissions"])
app.include_router(leaderboard.router, tags=["Leaderboard"])
app.include_router(livestream.router, tags=["Livestream"])
app.include_router(locations.router, tags=["Locations"])
app.include_router(events.router, tags=["Events"])
app.include_router(code_submissions.router, prefix="/tasks", tags=["Code Submissions"])
app.include_router(code_submissions.admin_router, tags=["Admin"])
app.include_router(finals.router, prefix="/finals", tags=["Finals"])
app.include_router(certificate.router, prefix="/certificate", tags=["Certificate"])
app.include_router(feedback.router, prefix="/feedback", tags=["Feedback"])


@app.get("/health")
async def health():
    return {"status": "ok"}
