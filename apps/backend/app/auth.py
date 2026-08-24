import secrets
from datetime import datetime, timedelta, timezone

import jwt
from jwt.exceptions import PyJWTError

from app.config import settings

JWT_ALGORITHM = "HS256"


def create_access_token(user_id: str, email: str, is_admin: bool = False) -> str:
    expire = datetime.now(timezone.utc) + timedelta(minutes=settings.jwt_expire_minutes)
    payload = {
        "sub": user_id,
        "email": email.lower(),
        "is_admin": is_admin,
        "iat": datetime.now(timezone.utc),
        "nbf": datetime.now(timezone.utc),
        "iss": settings.jwt_issuer,
        "aud": settings.jwt_audience,
        "exp": expire,
    }
    return jwt.encode(payload, settings.jwt_secret, algorithm=JWT_ALGORITHM)


def decode_access_token(token: str) -> dict | None:
    try:
        payload = jwt.decode(
            token,
            settings.jwt_secret,
            algorithms=[JWT_ALGORITHM],
            audience=settings.jwt_audience,
            issuer=settings.jwt_issuer,
            options={"require": ["sub", "email", "iat", "nbf", "exp", "iss", "aud"]},
        )
        return payload
    except PyJWTError:
        return None


def generate_code_verifier() -> str:
    """Generate a cryptographically random PKCE code_verifier."""
    return secrets.token_urlsafe(48)


def generate_state() -> str:
    """Generate a cryptographically random state parameter."""
    return secrets.token_urlsafe(32)
