from typing import Annotated

import asyncpg
from fastapi import Depends, HTTPException, Request, status

from app import db
from app.auth import decode_access_token
from app.security import hash_token


async def get_db() -> asyncpg.Connection:
    async with db.pool.acquire() as conn:
        yield conn


DB = Annotated[asyncpg.Connection, Depends(get_db)]


def _extract_token(request: Request) -> str | None:
    token = request.cookies.get("access_token")
    if token:
        return token
    auth = request.headers.get("authorization", "")
    if auth.startswith("Bearer "):
        return auth[7:]
    return None


async def get_current_user(
    request: Request,
    db: DB,
) -> dict:
    token = _extract_token(request)
    if not token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Missing token")

    user = await _resolve_user(db, token)

    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")

    ban = await db.fetchrow(
        "SELECT reason, banned_at FROM user_bans WHERE user_id = $1",
        user["id"],
    )
    if ban:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={"type": "banned", "reason": ban["reason"], "banned_at": ban["banned_at"].isoformat()},
        )

    return dict(user)


CurrentUser = Annotated[dict, Depends(get_current_user)]


async def get_admin_user(user: CurrentUser) -> dict:
    if not user.get("is_admin"):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin access required")
    return user


AdminUser = Annotated[dict, Depends(get_admin_user)]


async def get_optional_user(
    request: Request,
    db: DB,
) -> dict | None:
    token = _extract_token(request)
    if not token:
        return None

    user = await _resolve_user(db, token)
    if not user:
        return None
    ban = await db.fetchrow("SELECT 1 FROM user_bans WHERE user_id = $1", user["id"])
    if ban:
        return None
    return dict(user)


OptionalUser = Annotated[dict | None, Depends(get_optional_user)]


async def _resolve_user(db: asyncpg.Connection, token: str):
    if token.startswith("cmp_"):
        user = await db.fetchrow(
            """
            SELECT u.id, u.email, u.name, u.avatar_url, u.auth_provider, u.is_admin,
                   t.id AS api_token_id
            FROM api_tokens t
            JOIN users u ON u.id = t.user_id
            WHERE t.token_hash = $1
              AND t.revoked_at IS NULL
              AND t.expires_at > NOW()
            """,
            hash_token(token),
        )
        if user:
            await db.execute(
                """
                UPDATE api_tokens SET last_used_at = NOW()
                WHERE id = $1
                  AND (last_used_at IS NULL OR last_used_at < NOW() - INTERVAL '5 minutes')
                """,
                user["api_token_id"],
            )
        return user

    payload = decode_access_token(token)
    if not payload:
        return None
    return await db.fetchrow(
        "SELECT id, email, name, avatar_url, auth_provider, is_admin FROM users WHERE id = $1",
        payload["sub"],
    )
