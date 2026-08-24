import json
import secrets
import string

import asyncpg
from fastapi import APIRouter, HTTPException, Request, status

from app.dependencies import DB, CurrentUser
from app.helpers import compute_overall_rankings, get_user_team
from app.security import RateLimitExceeded, enforce_rate_limit

router = APIRouter()


def _generate_code() -> str:
    """Generate a certificate code like CERT-A3X9K2-F7BN."""
    chars = string.ascii_uppercase + string.digits
    part1 = "".join(secrets.choice(chars) for _ in range(6))
    part2 = "".join(secrets.choice(chars) for _ in range(4))
    return f"CERT-{part1}-{part2}"


@router.get("/data")
async def get_certificate_data(db: DB, user: CurrentUser):
    # Check leaderboard is revealed
    comp = await db.fetchrow(
        "SELECT id, slug, leaderboard_revealed FROM competitions WHERE is_active = true LIMIT 1"
    )
    if not comp:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Competition not found")
    if not comp["leaderboard_revealed"]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Certificates are not yet available",
        )

    # Get user's team
    team = await get_user_team(db, user["id"], comp["id"])
    if not team:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="You must be on a team to download a certificate",
        )
    team_id = str(team["id"])

    # Get participant name
    participant_name = await db.fetchval("SELECT name FROM users WHERE id = $1", user["id"])

    # Get team name
    team_row = await db.fetchrow("SELECT name FROM teams WHERE id = $1", team["id"])
    team_name = team_row["name"]

    # Overall rank
    entries, _ = await compute_overall_rankings(db, comp["id"], revealed=True)
    overall_rank = None
    total_teams = len(entries)
    for e in entries:
        if e["team_id"] == team_id:
            overall_rank = e["rank"]
            break

    # Per-task ranks (private evaluations take precedence when present)
    tasks = await db.fetch(
        """SELECT id, name, scoring_config FROM tasks
           WHERE competition_id = $1 AND is_active = true ORDER BY slug""",
        comp["id"],
    )
    task_placements = []
    for task in tasks:
        direction = (task["scoring_config"] or {}).get("score_direction", "maximize")
        order = "ASC" if direction == "minimize" else "DESC"
        rows = await db.fetch(
            """SELECT pe.team_id
               FROM private_evaluations pe
               WHERE pe.task_id = $1
                 AND pe.evaluation_round = (
                     SELECT MAX(evaluation_round) FROM private_evaluations WHERE task_id = $1
                 )
               ORDER BY pe.private_score """ + order,
            task["id"],
        )
        if not rows:
            rows = await db.fetch(
                """SELECT ls.team_id
                   FROM leaderboard_scores ls
                   JOIN teams t ON t.id = ls.team_id
                   WHERE ls.task_id = $1 AND t.deleted_at IS NULL AND ls.best_score IS NOT NULL
                   ORDER BY ls.best_score """ + order + ", ls.last_submission_at ASC",
                task["id"],
            )
        rank = None
        for i, r in enumerate(rows):
            if str(r["team_id"]) == team_id:
                rank = i + 1
                break
        task_placements.append({"task_name": task["name"], "rank": rank, "total_teams": len(rows)})

    # Get or create certificate record
    existing = await db.fetchrow(
        "SELECT certificate_code FROM certificate_records WHERE user_id = $1 AND competition_id = $2",
        user["id"],
        comp["id"],
    )

    if existing:
        certificate_code = existing["certificate_code"]
    else:
        candidate_code = _generate_code()
        for attempt in range(5):
            try:
                certificate_code = await db.fetchval(
                    """INSERT INTO certificate_records
                       (certificate_code, user_id, team_id, competition_id, participant_name, team_name, overall_rank, task_placements)
                       VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)
                       ON CONFLICT (user_id, competition_id) DO UPDATE
                           SET user_id = EXCLUDED.user_id
                       RETURNING certificate_code""",
                    candidate_code,
                    user["id"],
                    team["id"],
                    comp["id"],
                    participant_name,
                    team_name,
                    overall_rank,
                    json.dumps(task_placements),
                )
                break
            except asyncpg.UniqueViolationError:
                if attempt < 4:
                    candidate_code = _generate_code()
                else:
                    raise

    return {
        "participant_name": participant_name,
        "team_name": team_name,
        "overall_rank": overall_rank,
        "total_teams": total_teams,
        "task_placements": task_placements,
        "certificate_code": certificate_code,
    }


@router.get("/verify/{code}")
async def verify_certificate(code: str, request: Request, db: DB):
    client_ip = request.client.host if request.client else "unknown"
    async with db.transaction():
        try:
            await enforce_rate_limit(
                db,
                scope="certificate-verify",
                key=client_ip,
                limit=30,
                window_seconds=60,
            )
        except RateLimitExceeded:
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail="Too many verification requests. Please try again later.",
            )

    record = await db.fetchrow(
        """SELECT certificate_code, participant_name, team_name, overall_rank, task_placements, created_at
           FROM certificate_records WHERE certificate_code = $1""",
        code.upper(),
    )
    if not record:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Certificate not found",
        )

    placements = record["task_placements"]
    if isinstance(placements, str):
        placements = json.loads(placements)

    return {
        "valid": True,
        "certificate_code": record["certificate_code"],
        "participant_name": record["participant_name"],
        "team_name": record["team_name"],
        "overall_rank": record["overall_rank"],
        "task_placements": placements,
        "issued_at": record["created_at"].isoformat() if record["created_at"] else None,
    }
