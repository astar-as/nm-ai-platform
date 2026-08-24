import re
import secrets
import unicodedata
import uuid as uuid_mod
from logging import getLogger

from fastapi import APIRouter, BackgroundTasks, HTTPException, status
from pydantic import BaseModel, EmailStr, Field

from app import db as db_module
from app.config import settings
from app.dependencies import DB, CurrentUser
from app.helpers import check_roster_locked, require_captain
from app.security import RateLimitExceeded, enforce_rate_limit, hash_token
from app.services import loops

router = APIRouter()
logger = getLogger(__name__)


def _parse_uuid(value: str, label: str = "Resource") -> str:
    try:
        uuid_mod.UUID(value)
    except (ValueError, AttributeError):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"{label} not found")
    return value

def _validate_team_name(name: str) -> str:
    """Validate and normalize a team name. Returns the stripped name."""
    name = unicodedata.normalize("NFKC", name).strip()
    if not name:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Team name cannot be empty")
    if len(name) > 50:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Team name cannot exceed 50 characters")
    if len(name) < 2:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Team name must be at least 2 characters")
    if any(unicodedata.category(char).startswith("C") for char in name):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Team name contains unsupported characters")
    return name


class TeamCreate(BaseModel):
    name: str = Field(min_length=2, max_length=50)


class TeamJoin(BaseModel):
    invite_code: str = Field(min_length=1, max_length=20)


class TeamRename(BaseModel):
    name: str = Field(min_length=2, max_length=50)


class TeamInvite(BaseModel):
    email: EmailStr


class TeamJoinByInvite(BaseModel):
    token: str = Field(min_length=32, max_length=128)


class TransferCaptain(BaseModel):
    user_id: str


class TeamMemberResponse(BaseModel):
    id: str
    user_id: str
    name: str
    email: str
    role: str
    avatar_url: str | None = None


class PendingInviteResponse(BaseModel):
    id: str
    email: str


class TeamResponse(BaseModel):
    id: str
    name: str
    slug: str
    invite_code: str
    members: list[TeamMemberResponse] = Field(default_factory=list)
    pending_invites: list[PendingInviteResponse] = Field(default_factory=list)


@router.post("", response_model=TeamResponse, status_code=status.HTTP_201_CREATED)
async def create_team(data: TeamCreate, db: DB, user: CurrentUser):
    name = _validate_team_name(data.name)
    comp = await db.fetchrow("SELECT id FROM competitions WHERE is_active = true LIMIT 1")
    if not comp:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No active competition")

    base_slug = re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-") or "team"
    async with db.transaction():
        await db.execute(
            "SELECT pg_advisory_xact_lock(hashtext($1))",
            f"membership:{comp['id']}:{user['id']}",
        )
        existing = await db.fetchrow(
            """SELECT t.id FROM teams t JOIN team_members tm ON tm.team_id = t.id
               WHERE t.competition_id = $1 AND tm.user_id = $2 AND t.deleted_at IS NULL""",
            comp["id"],
            user["id"],
        )
        if existing:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Already in a team")
        has_submitted = await db.fetchval(
            """SELECT 1 FROM submissions s
               JOIN teams t ON t.id = s.team_id
               JOIN team_members tm ON tm.team_id = s.team_id
               WHERE tm.user_id = $1 AND t.competition_id = $2 LIMIT 1""",
            user["id"],
            comp["id"],
        )
        if has_submitted:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Cannot create a new team after submitting")

        team_id = None
        for attempt in range(5):
            slug = base_slug if attempt == 0 else f"{base_slug}-{secrets.token_hex(3)}"
            team_id = await db.fetchval(
                """INSERT INTO teams (competition_id, name, slug, invite_code)
                   VALUES ($1, $2, $3, $4)
                   ON CONFLICT (competition_id, slug) DO NOTHING
                   RETURNING id""",
                comp["id"],
                name,
                slug,
                secrets.token_hex(8).upper(),
            )
            if team_id:
                break
        if not team_id:
            raise HTTPException(status_code=409, detail="Could not allocate a unique team slug")
        await db.execute(
            "INSERT INTO team_members (team_id, user_id, role) VALUES ($1, $2, 'captain')",
            team_id,
            user["id"],
        )

    return await _get_team_response(db, team_id, viewer_user_id=str(user["id"]))


@router.get("/my", response_model=TeamResponse | None)
async def get_my_team(db: DB, user: CurrentUser):
    comp = await db.fetchrow("SELECT id FROM competitions WHERE is_active = true LIMIT 1")
    if not comp:
        return None

    row = await db.fetchrow(
        "SELECT t.id FROM teams t JOIN team_members tm ON tm.team_id = t.id WHERE t.competition_id = $1 AND tm.user_id = $2 AND t.deleted_at IS NULL",
        comp["id"],
        user["id"],
    )
    if not row:
        return None

    return await _get_team_response(db, row["id"], viewer_user_id=str(user["id"]))


@router.get("/by-slug/{slug}")
async def get_team_by_slug(slug: str, db: DB):
    team = await db.fetchrow(
        """SELECT t.id, t.name, t.slug FROM teams t
           JOIN competitions c ON c.id = t.competition_id
           WHERE t.slug = $1 AND t.deleted_at IS NULL AND c.is_active = true""",
        slug,
    )
    if not team:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND)

    members = await db.fetch(
        "SELECT u.name, u.avatar_url, tm.role FROM team_members tm JOIN users u ON u.id = tm.user_id WHERE tm.team_id = $1",
        team["id"],
    )

    return {
        "id": str(team["id"]),
        "name": team["name"],
        "slug": team["slug"],
        "members": [
            {
                "name": m["name"],
                "avatar_url": m["avatar_url"],
                "role": m["role"],
            }
            for m in members
        ],
    }


@router.get("/{team_id}", response_model=TeamResponse)
async def get_team(team_id: str, db: DB, user: CurrentUser):
    _parse_uuid(team_id, "Team")
    member = await db.fetchrow(
        "SELECT id FROM team_members WHERE team_id = $1 AND user_id = $2",
        team_id,
        user["id"],
    )
    if not member:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND)

    return await _get_team_response(db, team_id, viewer_user_id=str(user["id"]))


@router.patch("/{team_id}", response_model=TeamResponse)
async def rename_team(team_id: str, data: TeamRename, db: DB, user: CurrentUser):
    _parse_uuid(team_id, "Team")
    await require_captain(db, team_id, user["id"], "rename the team")

    name = _validate_team_name(data.name)

    team = await db.fetchrow("SELECT competition_id FROM teams WHERE id = $1 AND deleted_at IS NULL", team_id)
    if not team:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND)

    duplicate = await db.fetchrow(
        "SELECT id FROM teams WHERE competition_id = $1 AND LOWER(name) = LOWER($2) AND id != $3 AND deleted_at IS NULL",
        team["competition_id"],
        name,
        team_id,
    )
    if duplicate:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Team name already taken")

    await db.execute("UPDATE teams SET name = $1 WHERE id = $2", name, team_id)
    return await _get_team_response(db, team_id, viewer_user_id=str(user["id"]))


@router.delete("/{team_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_team(team_id: str, db: DB, user: CurrentUser):
    _parse_uuid(team_id, "Team")
    async with db.transaction():
        team = await db.fetchrow(
            "SELECT id FROM teams WHERE id = $1 AND deleted_at IS NULL FOR UPDATE",
            team_id,
        )
        if not team:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND)
        await require_captain(db, team_id, user["id"], "delete the team")
        await check_roster_locked(db, team_id)
        await db.execute("DELETE FROM team_members WHERE team_id = $1", team_id)
        await db.execute("UPDATE teams SET deleted_at = NOW() WHERE id = $1", team_id)


@router.post("/join", response_model=TeamResponse)
async def join_team(data: TeamJoin, db: DB, user: CurrentUser, bg: BackgroundTasks):
    async with db.transaction():
        try:
            await enforce_rate_limit(
                db,
                scope="team-join",
                key=str(user["id"]),
                limit=10,
                window_seconds=15 * 60,
            )
        except RateLimitExceeded:
            raise HTTPException(status_code=429, detail="Too many join attempts. Try again later.")

    async with db.transaction():
        team = await db.fetchrow(
            """SELECT t.id, t.competition_id, c.max_team_size
               FROM teams t JOIN competitions c ON c.id = t.competition_id
               WHERE t.invite_code = $1 AND t.deleted_at IS NULL""",
            data.invite_code.upper(),
        )
        if not team:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Invalid invite code")
        # Lock team row to serialize concurrent joins
        await db.fetchrow("SELECT id FROM teams WHERE id = $1 FOR UPDATE", team["id"])
        await check_roster_locked(db, team["id"])
        await db.execute(
            "SELECT pg_advisory_xact_lock(hashtext($1))",
            f"membership:{team['competition_id']}:{user['id']}",
        )

        existing = await db.fetchrow(
            "SELECT id FROM team_members WHERE team_id = $1 AND user_id = $2",
            team["id"],
            user["id"],
        )
        if existing:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Already in this team")

        member_count = await db.fetchval("SELECT COUNT(*) FROM team_members WHERE team_id = $1", team["id"])
        if member_count >= team["max_team_size"]:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Team is full")

        in_other_team = await db.fetchrow(
            "SELECT t.id FROM teams t JOIN team_members tm ON tm.team_id = t.id WHERE t.competition_id = $1 AND tm.user_id = $2 AND t.deleted_at IS NULL",
            team["competition_id"],
            user["id"],
        )
        if in_other_team:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Already in another team")

        await db.execute("INSERT INTO team_members (team_id, user_id, role) VALUES ($1, $2, 'member')", team["id"], user["id"])

        await db.execute(
            "UPDATE team_invitations SET accepted_at = NOW() WHERE team_id = $1 AND LOWER(email) = LOWER($2) AND accepted_at IS NULL",
            team["id"],
            user["email"],
        )

    bg.add_task(_notify_captain_of_join, team["id"], user["name"])

    return await _get_team_response(db, team["id"], viewer_user_id=str(user["id"]))


@router.post("/{team_id}/invite", response_model=TeamResponse)
async def invite_by_email(team_id: str, data: TeamInvite, db: DB, user: CurrentUser, bg: BackgroundTasks):
    _parse_uuid(team_id, "Team")
    await require_captain(db, team_id, user["id"], "send invites")
    await check_roster_locked(db, team_id)

    team = await db.fetchrow(
        """SELECT t.id, t.name, c.max_team_size
           FROM teams t JOIN competitions c ON c.id = t.competition_id
           WHERE t.id = $1 AND t.deleted_at IS NULL""",
        team_id,
    )
    if not team:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND)

    member_count = await db.fetchval("SELECT COUNT(*) FROM team_members WHERE team_id = $1", team_id)
    if member_count >= team["max_team_size"]:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Team is full")

    email = data.email.lower()

    already_member = await db.fetchrow(
        "SELECT u.id FROM users u JOIN team_members tm ON tm.user_id = u.id WHERE tm.team_id = $1 AND u.email = $2",
        team_id,
        email,
    )
    if already_member:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="This person is already on the team")

    existing_invite = await db.fetchrow(
        "SELECT id FROM team_invitations WHERE team_id = $1 AND email = $2 AND accepted_at IS NULL AND expires_at > NOW()",
        team_id,
        email,
    )
    if existing_invite:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="This person already has a pending invite")

    invite_count = await db.fetchval(
        "SELECT COUNT(*) FROM team_invitations WHERE team_id = $1 AND created_at > NOW() - INTERVAL '1 day'",
        team_id,
    )
    if invite_count >= 10:
        raise HTTPException(status_code=status.HTTP_429_TOO_MANY_REQUESTS, detail="Too many invites today, try again tomorrow")

    recipient_count = await db.fetchval(
        "SELECT COUNT(*) FROM team_invitations WHERE email = $1 AND created_at > NOW() - INTERVAL '1 day'",
        email,
    )
    if recipient_count >= 3:
        raise HTTPException(status_code=status.HTTP_429_TOO_MANY_REQUESTS, detail="This person has received too many invites today")

    token = secrets.token_urlsafe(48)
    await db.execute(
        "INSERT INTO team_invitations (team_id, email, token_hash, invited_by) VALUES ($1, $2, $3, $4)",
        team_id,
        email,
        hash_token(token),
        user["id"],
    )

    invite_url = f"{settings.frontend_url}/teams/join#token={token}"
    bg.add_task(loops.send_team_invite, email, invite_url, team["name"], user["name"])

    return await _get_team_response(db, team_id, viewer_user_id=str(user["id"]))


@router.delete("/{team_id}/invite/{invite_id}", response_model=TeamResponse)
async def revoke_invite(team_id: str, invite_id: str, db: DB, user: CurrentUser):
    _parse_uuid(team_id, "Team")
    _parse_uuid(invite_id, "Invite")
    await require_captain(db, team_id, user["id"], "revoke invites")

    deleted = await db.fetchval(
        "DELETE FROM team_invitations WHERE id = $1 AND team_id = $2 AND accepted_at IS NULL RETURNING id",
        invite_id,
        team_id,
    )
    if not deleted:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Invite not found")

    return await _get_team_response(db, team_id, viewer_user_id=str(user["id"]))


@router.post("/join-by-invite", response_model=TeamResponse)
async def join_by_invite(data: TeamJoinByInvite, db: DB, user: CurrentUser, bg: BackgroundTasks):
    async with db.transaction():
        invitation = await db.fetchrow(
            """SELECT id, team_id, email FROM team_invitations
               WHERE token_hash = $1 AND accepted_at IS NULL AND expires_at > NOW()
               FOR UPDATE""",
            hash_token(data.token),
        )
        if not invitation:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Invalid or expired invite")
        if invitation["email"].lower() != user["email"].lower():
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="This invite was sent to another email address")

        team = await db.fetchrow(
            """SELECT t.id, t.competition_id, c.max_team_size
               FROM teams t JOIN competitions c ON c.id = t.competition_id
               WHERE t.id = $1 AND t.deleted_at IS NULL FOR UPDATE OF t""",
            invitation["team_id"],
        )
        if not team:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Team no longer exists")

        await check_roster_locked(db, team["id"])
        await db.execute(
            "SELECT pg_advisory_xact_lock(hashtext($1))",
            f"membership:{team['competition_id']}:{user['id']}",
        )

        existing = await db.fetchrow(
            "SELECT id FROM team_members WHERE team_id = $1 AND user_id = $2",
            team["id"],
            user["id"],
        )
        if existing:
            await db.execute("UPDATE team_invitations SET accepted_at = NOW() WHERE id = $1", invitation["id"])
            joined = False
        else:
            member_count = await db.fetchval("SELECT COUNT(*) FROM team_members WHERE team_id = $1", team["id"])
            if member_count >= team["max_team_size"]:
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Team is full")

            in_other_team = await db.fetchrow(
                "SELECT t.id FROM teams t JOIN team_members tm ON tm.team_id = t.id WHERE t.competition_id = $1 AND tm.user_id = $2 AND t.deleted_at IS NULL",
                team["competition_id"],
                user["id"],
            )
            if in_other_team:
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Already in another team")

            await db.execute("INSERT INTO team_members (team_id, user_id, role) VALUES ($1, $2, 'member')", team["id"], user["id"])
            await db.execute("UPDATE team_invitations SET accepted_at = NOW() WHERE id = $1", invitation["id"])
            joined = True

    if joined:
        bg.add_task(_notify_captain_of_join, team["id"], user["name"])

    return await _get_team_response(db, team["id"], viewer_user_id=str(user["id"]))


@router.post("/{team_id}/leave", status_code=status.HTTP_204_NO_CONTENT)
async def leave_team(team_id: str, db: DB, user: CurrentUser):
    _parse_uuid(team_id, "Team")
    member = await db.fetchrow("SELECT role FROM team_members WHERE team_id = $1 AND user_id = $2", team_id, user["id"])
    if not member:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND)

    if member["role"] == "captain":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Captain cannot leave")

    await check_roster_locked(db, team_id)
    await db.execute("DELETE FROM team_members WHERE team_id = $1 AND user_id = $2", team_id, user["id"])


@router.delete("/{team_id}/members/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_member(team_id: str, user_id: str, db: DB, user: CurrentUser):
    _parse_uuid(team_id, "Team")
    _parse_uuid(user_id, "User")
    captain = await db.fetchrow("SELECT id FROM team_members WHERE team_id = $1 AND user_id = $2 AND role = 'captain'", team_id, user["id"])
    if not captain:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN)

    if user_id == user["id"]:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Cannot remove yourself")

    await check_roster_locked(db, team_id)

    await db.execute("DELETE FROM team_members WHERE team_id = $1 AND user_id = $2", team_id, user_id)

    # Rotate invite code so kicked member can't rejoin with old code
    new_code = secrets.token_hex(8).upper()
    await db.execute("UPDATE teams SET invite_code = $1 WHERE id = $2", new_code, team_id)


@router.post("/{team_id}/transfer-captain", response_model=TeamResponse)
async def transfer_captain(team_id: str, data: TransferCaptain, db: DB, user: CurrentUser):
    _parse_uuid(team_id, "Team")
    if data.user_id == user["id"]:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Already the captain")
    await check_roster_locked(db, team_id)

    async with db.transaction():
        captain = await db.fetchrow(
            "SELECT id FROM team_members WHERE team_id = $1 AND user_id = $2 AND role = 'captain' FOR UPDATE",
            team_id,
            user["id"],
        )
        if not captain:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only the captain can transfer captainship")

        target = await db.fetchrow(
            "SELECT id FROM team_members WHERE team_id = $1 AND user_id = $2 FOR UPDATE",
            team_id,
            data.user_id,
        )
        if not target:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User is not a member of this team")

        await db.execute("UPDATE team_members SET role = 'member' WHERE id = $1", captain["id"])
        await db.execute("UPDATE team_members SET role = 'captain' WHERE id = $1", target["id"])

    return await _get_team_response(db, team_id, viewer_user_id=str(user["id"]))


async def _get_team_response(db, team_id: str, viewer_user_id: str | None = None) -> TeamResponse:
    team = await db.fetchrow("SELECT id, name, slug, invite_code FROM teams WHERE id = $1 AND deleted_at IS NULL", team_id)
    if not team:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND)

    members = await db.fetch(
        "SELECT tm.id, tm.user_id, u.name, u.email, tm.role, u.avatar_url FROM team_members tm JOIN users u ON u.id = tm.user_id WHERE tm.team_id = $1",
        team_id,
    )

    # Only captain gets invite_code and pending_invites (defense in depth — frontend also hides these)
    is_captain = any(
        str(m["user_id"]) == viewer_user_id and m["role"] == "captain"
        for m in members
    )

    pending = []
    if is_captain:
        pending = await db.fetch(
            "SELECT id, email FROM team_invitations WHERE team_id = $1 AND accepted_at IS NULL AND expires_at > NOW()",
            team_id,
        )

    return TeamResponse(
        id=str(team["id"]),
        name=team["name"],
        slug=team["slug"],
        invite_code=team["invite_code"] if is_captain else "",
        members=[
            TeamMemberResponse(
                id=str(m["id"]),
                user_id=str(m["user_id"]),
                name=m["name"],
                email=m["email"],
                role=m["role"],
                avatar_url=m["avatar_url"],
            )
            for m in members
        ],
        pending_invites=[
            PendingInviteResponse(id=str(p["id"]), email=p["email"])
            for p in pending
        ],
    )



async def _notify_captain_of_join(team_id: str, member_name: str) -> None:
    """Background task: email captain when a new member joins. Acquires its own DB connection."""
    try:
        async with db_module.pool.acquire() as conn:
            row = await conn.fetchrow(
                "SELECT u.email, t.name AS team_name FROM team_members tm JOIN users u ON u.id = tm.user_id JOIN teams t ON t.id = tm.team_id WHERE tm.team_id = $1 AND tm.role = 'captain'",
                team_id,
            )
        if row:
            await loops.send_member_joined(row["email"], member_name or "A teammate", row["team_name"])
    except Exception:
        logger.exception("Failed to notify captain of join for team %s", team_id)
