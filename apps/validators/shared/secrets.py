import base64

from cryptography.hazmat.primitives.ciphers.aead import AESGCM

from shared.config import settings

_PREFIX = "enc:v1:"


def decrypt_submission_secret(value: str | None) -> str | None:
    if not value:
        return None
    if not value.startswith(_PREFIX):
        raise ValueError("Refusing to use an unencrypted submission secret")
    if not settings.submission_secret_key:
        raise ValueError("SUBMISSION_SECRET_KEY is required")
    try:
        key = base64.urlsafe_b64decode(settings.submission_secret_key)
        payload = base64.urlsafe_b64decode(value.removeprefix(_PREFIX))
    except Exception as exc:
        raise ValueError("Invalid encrypted submission secret") from exc
    if len(key) != 32 or len(payload) < 13:
        raise ValueError("Invalid encrypted submission secret")
    return AESGCM(key).decrypt(payload[:12], payload[12:], None).decode("utf-8")
