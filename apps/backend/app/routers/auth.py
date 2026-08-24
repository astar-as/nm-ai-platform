import asyncio
import logging
import secrets
from urllib.parse import urlencode

import asyncpg
from fastapi import APIRouter, HTTPException, Query, Request, status
from fastapi.responses import JSONResponse, RedirectResponse, Response
from pydantic import BaseModel, EmailStr, Field

from app.auth import (
    create_access_token,
    decode_access_token,
    generate_code_verifier,
    generate_state,
)
from app.config import settings
from app.dependencies import DB
from app.oauth.google import GoogleOAuthProvider, _compute_code_challenge
from app.security import RateLimitExceeded, enforce_rate_limit, hash_token
from app.services.loops import send_magic_link, sync_contact

logger = logging.getLogger(__name__)

router = APIRouter()

PROVIDERS = {
    "google": GoogleOAuthProvider(),
}

REDIRECT_URIS = {
    "google": lambda: settings.google_redirect_uri,
}


def _set_auth_cookie(response: Response, token: str) -> None:
    response.set_cookie(
        key="access_token",
        value=token,
        max_age=settings.jwt_expire_minutes * 60,
        httponly=True,
        secure=settings.cookie_secure,
        samesite="lax",
        domain=settings.cookie_domain,
        path="/",
    )


def _delete_auth_cookie(response: Response) -> None:
    response.delete_cookie(
        key="access_token",
        domain=settings.cookie_domain,
        path="/",
    )


class MockLoginRequest(BaseModel):
    email: EmailStr
    name: str = ""


class MagicLinkRequest(BaseModel):
    email: EmailStr


class MagicVerifyRequest(BaseModel):
    token: str = Field(min_length=32, max_length=256)



@router.get("/login")
async def oauth_login(db: DB, provider: str = Query(...)):
    if provider not in PROVIDERS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unsupported provider: {provider}",
        )

    oauth = PROVIDERS[provider]
    state = generate_state()
    code_verifier = generate_code_verifier()
    code_challenge = _compute_code_challenge(code_verifier)

    redirect_uri = REDIRECT_URIS[provider]()

    await db.execute(
        """
        INSERT INTO oauth_states (state, code_verifier, code_challenge, provider, redirect_uri)
        VALUES ($1, $2, $3, $4, $5)
        """,
        state,
        code_verifier,
        code_challenge,
        provider,
        redirect_uri,
    )

    authorize_url = await oauth.get_authorize_url(state, code_verifier)
    return RedirectResponse(url=authorize_url, status_code=status.HTTP_302_FOUND)


@router.get("/callback")
async def oauth_callback(
    db: DB,
    code: str = Query(None),
    state: str = Query(None),
    error: str = Query(None),
    error_description: str = Query(None),
):
    frontend_callback = f"{settings.frontend_url}/auth/callback"

    if error:
        logger.warning("OAuth error from provider: %s - %s", error, error_description)
        params = urlencode({"error": "Authentication was denied or failed"})
        return RedirectResponse(
            url=f"{frontend_callback}?{params}",
            status_code=status.HTTP_302_FOUND,
        )

    if not code or not state:
        params = urlencode({"error": "Missing code or state parameter"})
        return RedirectResponse(
            url=f"{frontend_callback}?{params}",
            status_code=status.HTTP_302_FOUND,
        )

    try:
        await db.execute("DELETE FROM oauth_states WHERE expires_at <= NOW()")

        row = await db.fetchrow(
            """
            DELETE FROM oauth_states
            WHERE state = $1 AND expires_at > NOW()
            RETURNING code_verifier, provider
            """,
            state,
        )

        if not row:
            params = urlencode({"error": "Invalid or expired state"})
            return RedirectResponse(
                url=f"{frontend_callback}?{params}",
                status_code=status.HTTP_302_FOUND,
            )

        provider_name = row["provider"]
        code_verifier = row["code_verifier"]

        oauth = PROVIDERS.get(provider_name)
        if not oauth:
            params = urlencode({"error": f"Unknown provider: {provider_name}"})
            return RedirectResponse(
                url=f"{frontend_callback}?{params}",
                status_code=status.HTTP_302_FOUND,
            )

        tokens = await oauth.exchange_code(code, code_verifier)
        oauth_user = await oauth.get_user_info(tokens)
        oauth_user.email = oauth_user.email.lower()

        existing_user = await db.fetchval(
            "SELECT id FROM users WHERE auth_provider = $1 AND auth_provider_id = $2",
            oauth_user.provider,
            oauth_user.provider_user_id,
        )

        try:
            user_id = await db.fetchval(
                """
                INSERT INTO users (email, name, avatar_url, auth_provider, auth_provider_id)
                VALUES ($1, $2, $3, $4, $5)
                ON CONFLICT (auth_provider, auth_provider_id)
                DO UPDATE SET
                    email = EXCLUDED.email,
                    name = users.name,
                    avatar_url = COALESCE(EXCLUDED.avatar_url, users.avatar_url),
                    updated_at = NOW()
                RETURNING id
                """,
                oauth_user.email,
                oauth_user.name,
                oauth_user.avatar_url,
                oauth_user.provider,
                oauth_user.provider_user_id,
            )
        except asyncpg.UniqueViolationError:
            user_id = await db.fetchval(
                """
                UPDATE users
                SET auth_provider = $2,
                    auth_provider_id = $3,
                    name = COALESCE(NULLIF($4, ''), name),
                    avatar_url = COALESCE($5, avatar_url),
                    updated_at = NOW()
                WHERE email = $1
                RETURNING id
                """,
                oauth_user.email,
                oauth_user.provider,
                oauth_user.provider_user_id,
                oauth_user.name,
                oauth_user.avatar_url,
            )

        is_admin = await db.fetchval("SELECT is_admin FROM users WHERE id = $1", user_id)
        jwt_token = create_access_token(str(user_id), oauth_user.email, is_admin=is_admin or False)

        asyncio.create_task(sync_contact(oauth_user.email, oauth_user.name))

        is_new = "1" if not existing_user else ""
        redirect_url = f"{frontend_callback}?new={is_new}" if is_new else frontend_callback
        response = RedirectResponse(url=redirect_url, status_code=status.HTTP_302_FOUND)
        _set_auth_cookie(response, jwt_token)
        return response

    except Exception:
        logger.exception("OAuth callback failed")
        params = urlencode({"error": "Authentication failed"})
        return RedirectResponse(
            url=f"{frontend_callback}?{params}",
            status_code=status.HTTP_302_FOUND,
        )


# ---------------------------------------------------------------------------- #
#                              MAGIC LINK AUTH                                  #
# ---------------------------------------------------------------------------- #


@router.post("/magic/send", status_code=status.HTTP_202_ACCEPTED)
async def magic_send(data: MagicLinkRequest, request: Request, db: DB):
    email = data.email.lower()
    client_ip = request.client.host if request.client else "unknown"
    async with db.transaction():
        try:
            await enforce_rate_limit(
                db, scope="magic-email", key=email, limit=3, window_seconds=60 * 60
            )
            await enforce_rate_limit(
                db, scope="magic-ip", key=client_ip, limit=20, window_seconds=60 * 60
            )
        except RateLimitExceeded:
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail="Too many login attempts. Please try again later.",
            )
    token = secrets.token_urlsafe(64)
    await db.execute(
        "INSERT INTO magic_tokens (email, token_hash, request_ip) VALUES ($1, $2, $3)",
        email,
        hash_token(token),
        client_ip,
    )

    magic_url = f"{settings.frontend_url}/auth/magic#token={token}"
    asyncio.create_task(send_magic_link(email, magic_url))

    return {"message": "If this email is registered, you will receive a login link"}


@router.post("/magic/verify", name="magic_verify")
async def magic_verify(data: MagicVerifyRequest, db: DB):
    row = await db.fetchrow(
        """DELETE FROM magic_tokens
           WHERE token_hash = $1 AND expires_at > NOW()
           RETURNING id, email""",
        hash_token(data.token),
    )

    if not row:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired login link",
        )

    email = row["email"].lower()

    existing = await db.fetchval("SELECT id FROM users WHERE email = $1", email)

    user_id = await db.fetchval(
        """
        INSERT INTO users (email, name, auth_provider, auth_provider_id)
        VALUES ($1, '', 'magic', $1)
        ON CONFLICT (email) DO UPDATE SET updated_at = NOW()
        RETURNING id
        """,
        email,
    )

    is_admin = await db.fetchval("SELECT is_admin FROM users WHERE id = $1", user_id)
    jwt_token = create_access_token(str(user_id), email, is_admin=is_admin or False)

    asyncio.create_task(sync_contact(email))

    response = JSONResponse(content={"new_user": not bool(existing)})
    _set_auth_cookie(response, jwt_token)
    return response


@router.post("/mock")
async def mock_login(data: MockLoginRequest, db: DB):
    if not settings.allow_mock_auth:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Mock authentication is disabled",
        )

    email = data.email.lower()
    user = await db.fetchrow("SELECT id, email FROM users WHERE email = $1", email)

    if not user:
        user_id = await db.fetchval(
            """
            INSERT INTO users (email, name, auth_provider, auth_provider_id)
            VALUES ($1, $2, 'mock', $1)
            RETURNING id
            """,
            email,
            data.name,
        )
    else:
        user_id = user["id"]

    is_admin = await db.fetchval("SELECT is_admin FROM users WHERE id = $1", user_id)
    token = create_access_token(str(user_id), email, is_admin=is_admin or False)
    response = JSONResponse(content={"access_token": token, "token_type": "bearer"})
    _set_auth_cookie(response, token)
    return response


@router.get("/ban-check")
async def ban_check(request: Request, db: DB):
    token = request.cookies.get("access_token")
    if not token:
        response = JSONResponse(content={"banned": False})
        response.delete_cookie(key="user_banned", domain=settings.cookie_domain, path="/")
        return response

    payload = decode_access_token(token)
    if not payload:
        response = JSONResponse(content={"banned": False})
        response.delete_cookie(key="user_banned", domain=settings.cookie_domain, path="/")
        return response

    ban = await db.fetchrow(
        "SELECT reason, banned_at FROM user_bans WHERE user_id = $1",
        payload["sub"],
    )
    if ban:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={"type": "banned", "reason": ban["reason"], "banned_at": ban["banned_at"].isoformat()},
        )

    response = JSONResponse(content={"banned": False})
    response.delete_cookie(key="user_banned", domain=settings.cookie_domain, path="/")
    return response


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
async def logout():
    response = Response(status_code=204)
    _delete_auth_cookie(response)
    response.delete_cookie(key="user_banned", domain=settings.cookie_domain, path="/")
    return response
