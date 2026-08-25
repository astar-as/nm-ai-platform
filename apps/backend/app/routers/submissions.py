
from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, Field, field_validator

from app.dependencies import DB, CurrentUser
from app.helpers import (
    check_competition_open,
    get_submission_quota,
    get_team_for_competition,
)
from app.security import encrypt_submission_secret, normalize_https_url

router = APIRouter()
submission_detail_router = APIRouter()


class SubmissionCreate(BaseModel):
    endpoint_url: str = Field(max_length=2048)
    endpoint_api_key: str | None = Field(default=None, max_length=4096)

    @field_validator("endpoint_url")
    @classmethod
    def validate_url(cls, v: str) -> str:
        return normalize_https_url(v)

_ERROR_MAX_LEN = 200

def _sanitize_error(error: str | None) -> str | None:
    if not error:
        return None
    if any(kw in error.lower() for kw in ("traceback", "/app/", "/home/", "file \"", "gs://")):
        return "Internal error during evaluation"
    return error[:_ERROR_MAX_LEN]


@router.post("/{task_id}/submissions", status_code=status.HTTP_201_CREATED)
async def create_submission(task_id: str, data: SubmissionCreate, db: DB, user: CurrentUser):
    task = await db.fetchrow(
        """SELECT t.id, t.competition_id, t.is_active, t.submission_mode, t.scoring_config
           FROM tasks t JOIN competitions c ON c.id = t.competition_id
           WHERE t.id = $1 AND c.is_active = true
             AND COALESCE(t.reveals_at, c.starts_at) <= NOW()""",
        task_id,
    )
    if not task:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Task not found")

    if not task["is_active"]:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Task not active")

    await check_competition_open(db, task["competition_id"], task_id=task_id)

    if task["submission_mode"] != "endpoint":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Use the code upload endpoint for this task")

    team = await get_team_for_competition(db, task["competition_id"], user["id"])
    if not team:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Not in a team")

    team_id = team["id"]

    try:
        encrypted_api_key = encrypt_submission_secret(data.endpoint_api_key)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(exc)) from exc

    limits = (task["scoring_config"] or {}).get("submission_limits", {})
    async with db.transaction():
        await db.execute(
            "SELECT pg_advisory_xact_lock(hashtext($1 || ':' || $2))",
            str(team_id),
            str(task_id),
        )
        quota = await get_submission_quota(db, team_id, task_id, limits)
        if quota["is_banned"]:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Submissions disabled: {quota['ban_reason'] or 'Banned'}",
            )
        if quota["in_flight"] >= quota["max_in_flight"]:
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail=f"Max {quota['max_in_flight']} in-flight submissions",
            )
        if quota["daily_used"] >= quota["daily_limit"]:
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail=f"Daily limit reached ({quota['max_per_day']}/day)",
            )
        submission_id = await db.fetchval(
            """INSERT INTO submissions
               (team_id, task_id, endpoint_url, endpoint_api_key, submission_type, created_by)
               VALUES ($1, $2, $3, $4, 'endpoint', $5) RETURNING id""",
            team_id,
            task_id,
            data.endpoint_url,
            encrypted_api_key,
            user["id"],
        )

    return {
        "id": str(submission_id),
        "status": "queued",
        "daily_submissions_used": quota["daily_used"] + 1,
        "daily_submissions_max": quota["daily_limit"],
    }


@router.get("/{task_id}/submissions")
async def list_submissions(task_id: str, db: DB, user: CurrentUser):
    task = await db.fetchrow(
        """SELECT t.id, t.competition_id FROM tasks t
           JOIN competitions c ON c.id = t.competition_id
           WHERE t.id = $1 AND t.submission_mode = 'endpoint'
             AND t.is_active = true AND c.is_active = true
             AND COALESCE(t.reveals_at, c.starts_at) <= NOW()""",
        task_id,
    )
    if not task:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND)

    team = await get_team_for_competition(db, task["competition_id"], user["id"])
    if not team:
        return []

    rows = await db.fetch(
        """
        SELECT s.id, s.status, s.endpoint_url, s.queued_at, s.started_at, s.completed_at, s.last_error, e.score, e.metrics
        FROM submissions s
        LEFT JOIN evaluations e ON e.submission_id = s.id
        WHERE s.team_id = $1 AND s.task_id = $2
        ORDER BY s.queued_at DESC
        """,
        team["id"],
        task_id,
    )

    results = []
    for r in rows:
        item = {"id": str(r["id"]), "status": r["status"], "endpoint_url": r["endpoint_url"], "queued_at": r["queued_at"], "started_at": r["started_at"], "completed_at": r["completed_at"], "score": float(r["score"]) if r["score"] is not None else None, "error_message": _sanitize_error(r["last_error"])}
        results.append(item)
    return results


@submission_detail_router.get("/{submission_id}")
async def get_submission(submission_id: str, db: DB, user: CurrentUser):
    row = await db.fetchrow(
        """
        SELECT s.id, s.team_id, s.task_id, s.status, s.queued_at, s.started_at, s.completed_at,
               s.error_type,
               e.score, e.metrics, e.duration_ms, e.error_message
        FROM submissions s
        JOIN team_members tm ON tm.team_id = s.team_id
        LEFT JOIN evaluations e ON e.submission_id = s.id
        WHERE s.id = $1 AND tm.user_id = $2
        """,
        submission_id,
        user["id"],
    )
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND)

    return {
        "id": str(row["id"]),
        "team_id": str(row["team_id"]),
        "task_id": str(row["task_id"]),
        "status": row["status"],
        "queued_at": row["queued_at"],
        "started_at": row["started_at"],
        "completed_at": row["completed_at"],
        "score": float(row["score"]) if row["score"] is not None else None,
        "duration_ms": row["duration_ms"],
        "error_message": _sanitize_error(row["error_message"]),
        "error_type": row["error_type"],
    }
