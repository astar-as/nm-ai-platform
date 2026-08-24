import base64
import hashlib
import secrets
from urllib.parse import urlsplit, urlunsplit

from cryptography.hazmat.primitives.ciphers.aead import AESGCM

from app.config import settings

_ENCRYPTED_PREFIX = "enc:v1:"


def hash_token(token: str) -> str:
    """Return a fixed-length digest suitable for one-time-token lookup."""
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def normalize_https_url(value: str) -> str:
    """Validate a participant endpoint without performing any network access."""
    parsed = urlsplit(value.strip())
    if parsed.scheme.lower() != "https" or not parsed.hostname:
        raise ValueError("Only absolute HTTPS endpoints are allowed")
    if parsed.username or parsed.password:
        raise ValueError("Endpoint URLs cannot contain credentials")
    if parsed.fragment:
        raise ValueError("Endpoint URLs cannot contain fragments")
    try:
        port = parsed.port
    except ValueError as exc:
        raise ValueError("Endpoint URL contains an invalid port") from exc
    if port is not None and not 1 <= port <= 65535:
        raise ValueError("Endpoint URL contains an invalid port")
    return urlunsplit(("https", parsed.netloc, parsed.path or "/", parsed.query, ""))


def encrypt_submission_secret(value: str | None) -> str | None:
    if not value:
        return None
    key = _submission_key()
    nonce = secrets.token_bytes(12)
    ciphertext = AESGCM(key).encrypt(nonce, value.encode("utf-8"), None)
    encoded = base64.urlsafe_b64encode(nonce + ciphertext).decode("ascii")
    return _ENCRYPTED_PREFIX + encoded


def decrypt_submission_secret(value: str | None) -> str | None:
    if not value:
        return None
    if not value.startswith(_ENCRYPTED_PREFIX):
        raise ValueError("Refusing to use an unencrypted submission secret")
    key = _submission_key()
    payload = base64.urlsafe_b64decode(value.removeprefix(_ENCRYPTED_PREFIX))
    if len(payload) < 13:
        raise ValueError("Invalid encrypted submission secret")
    return AESGCM(key).decrypt(payload[:12], payload[12:], None).decode("utf-8")


def _submission_key() -> bytes:
    if not settings.submission_secret_key:
        raise ValueError("SUBMISSION_SECRET_KEY is required when endpoint credentials are used")
    try:
        key = base64.urlsafe_b64decode(settings.submission_secret_key)
    except Exception as exc:
        raise ValueError("SUBMISSION_SECRET_KEY must be URL-safe base64") from exc
    if len(key) != 32:
        raise ValueError("SUBMISSION_SECRET_KEY must decode to exactly 32 bytes")
    return key


async def enforce_rate_limit(
    db,
    *,
    scope: str,
    key: str,
    limit: int,
    window_seconds: int,
) -> None:
    """Atomically consume one database-backed rate-limit event."""
    await db.execute(
        "SELECT pg_advisory_xact_lock(hashtext($1))",
        f"rate-limit:{scope}:{key}",
    )
    await db.execute(
        "DELETE FROM rate_limit_events WHERE created_at < NOW() - make_interval(secs => $1)",
        window_seconds,
    )
    count = await db.fetchval(
        """
        SELECT COUNT(*) FROM rate_limit_events
        WHERE scope = $1 AND key_hash = encode(digest($2, 'sha256'), 'hex')
          AND created_at >= NOW() - make_interval(secs => $3)
        """,
        scope,
        key,
        window_seconds,
    )
    if count >= limit:
        raise RateLimitExceeded
    await db.execute(
        """
        INSERT INTO rate_limit_events (scope, key_hash)
        VALUES ($1, encode(digest($2, 'sha256'), 'hex'))
        """,
        scope,
        key,
    )


class RateLimitExceeded(Exception):
    pass
