import logging

import httpx

from app.config import settings

logger = logging.getLogger(__name__)

LOOPS_BASE = "https://app.loops.so/api/v1"


async def _post_with_retry(url: str, json: dict) -> httpx.Response | None:
    headers = {
        "Authorization": f"Bearer {settings.loops_api_key}",
        "Content-Type": "application/json",
    }
    async with httpx.AsyncClient(timeout=10) as client:
        for attempt in range(2):
            resp = await client.post(url, json=json, headers=headers)
            if resp.status_code < 500:
                return resp
            if attempt == 0:
                logger.warning("Loops API returned %s, retrying once", resp.status_code)
    return resp


async def _send_transactional(transactional_id: str, email: str, data: dict, label: str) -> None:
    """Send a transactional email via Loops. Silently skips if API key or ID is missing."""
    if not settings.loops_api_key:
        logger.info("Loops API key not set; skipping %s email", label)
        return
    if not transactional_id:
        logger.info("Loops transactional ID not set; skipping %s email", label)
        return

    try:
        resp = await _post_with_retry(
            f"{LOOPS_BASE}/transactional",
            {
                "transactionalId": transactional_id,
                "email": email,
                "dataVariables": data,
            },
        )
        if resp and not resp.is_success:
            logger.warning("Loops %s failed with status %s", label, resp.status_code)
    except Exception:
        logger.exception("Failed to send %s email", label)


async def send_magic_link(email: str, magic_url: str) -> None:
    await _send_transactional(
        settings.loops_transactional_id,
        email,
        {"magic_url": magic_url},
        "magic_link",
    )


async def send_team_invite(email: str, invite_url: str, team_name: str, inviter_name: str) -> None:
    await _send_transactional(
        settings.loops_invite_transactional_id,
        email,
        {"invite_url": invite_url, "team_name": team_name, "inviter_name": inviter_name},
        "team_invite",
    )


async def send_member_joined(captain_email: str, member_name: str, team_name: str) -> None:
    await _send_transactional(
        settings.loops_member_joined_transactional_id,
        captain_email,
        {
            "member_name": member_name,
            "team_name": team_name,
            "dashboard_url": f"{settings.frontend_url}/dashboard",
        },
        "member_joined",
    )


async def sync_contact(
    email: str,
    name: str = "",
    registered: bool = True,
    team_name: str | None = None,
) -> None:
    if not settings.loops_api_key:
        logger.info("Loops API key not set; skipping contact sync")
        return

    body: dict = {
        "email": email,
        "firstName": name,
        "registered": registered,
    }
    if team_name is not None:
        body["teamName"] = team_name

    try:
        resp = await _post_with_retry(f"{LOOPS_BASE}/contacts/update", body)
        if resp and not resp.is_success:
            logger.warning("Loops contact sync failed with status %s", resp.status_code)
    except Exception:
        logger.exception("Failed to sync contact")
