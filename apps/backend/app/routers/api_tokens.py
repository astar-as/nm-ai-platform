import secrets
from datetime import datetime, timedelta, timezone
from uuid import UUID

from fastapi import APIRouter, HTTPException, Request, Response, status
from pydantic import BaseModel, Field

from app.auth import decode_access_token
from app.dependencies import DB, CurrentUser
from app.security import hash_token

router = APIRouter()


class TokenCreate(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    expires_in_days: int = Field(default=30, ge=1, le=365)


class TokenCreated(BaseModel):
    id: UUID
    name: str
    token: str
    token_hint: str
    expires_at: datetime


class TokenSummary(BaseModel):
    id: UUID
    name: str
    token_hint: str
    expires_at: datetime
    last_used_at: datetime | None
    created_at: datetime


@router.post("", response_model=TokenCreated, status_code=status.HTTP_201_CREATED)
async def create_token(data: TokenCreate, request: Request, db: DB, user: CurrentUser):
    browser_token = request.cookies.get("access_token")
    browser_claims = decode_access_token(browser_token) if browser_token else None
    if not browser_claims or browser_claims.get("sub") != str(user["id"]):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Create access tokens from an authenticated browser session",
        )
    name = data.name.strip()
    if not name:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Name is required")
    raw_token = "cmp_" + secrets.token_urlsafe(48)
    token_hint = f"{raw_token[:8]}...{raw_token[-4:]}"
    expires_at = datetime.now(timezone.utc) + timedelta(days=data.expires_in_days)
    row = await db.fetchrow(
        """
        INSERT INTO api_tokens (user_id, name, token_hash, token_hint, expires_at)
        VALUES ($1, $2, $3, $4, $5)
        RETURNING id, name, token_hint, expires_at
        """,
        user["id"],
        name,
        hash_token(raw_token),
        token_hint,
        expires_at,
    )
    return TokenCreated(token=raw_token, **dict(row))


@router.get("", response_model=list[TokenSummary])
async def list_tokens(db: DB, user: CurrentUser):
    rows = await db.fetch(
        """
        SELECT id, name, token_hint, expires_at, last_used_at, created_at
        FROM api_tokens
        WHERE user_id = $1 AND revoked_at IS NULL AND expires_at > NOW()
        ORDER BY created_at DESC
        """,
        user["id"],
    )
    return [TokenSummary(**dict(row)) for row in rows]


@router.delete("/{token_id}", status_code=status.HTTP_204_NO_CONTENT)
async def revoke_token(token_id: UUID, db: DB, user: CurrentUser):
    result = await db.execute(
        """
        UPDATE api_tokens SET revoked_at = NOW()
        WHERE id = $1 AND user_id = $2 AND revoked_at IS NULL
        """,
        token_id,
        user["id"],
    )
    if result == "UPDATE 0":
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Token not found")
    return Response(status_code=status.HTTP_204_NO_CONTENT)
