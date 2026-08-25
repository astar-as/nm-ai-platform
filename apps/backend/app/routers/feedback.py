import json
from typing import Any

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, Field

from app.dependencies import DB, AdminUser, CurrentUser

router = APIRouter()


class FeedbackPayload(BaseModel):
    answers: dict[str, Any] = Field(default_factory=dict)


async def _active_competition_id(db) -> str:
    comp = await db.fetchrow("SELECT id FROM competitions WHERE is_active = true LIMIT 1")
    if not comp:
        raise HTTPException(status_code=404, detail="No active competition")
    return comp["id"]


def _row_to_submission(row) -> dict:
    answers = row["answers"]
    if isinstance(answers, str):
        answers = json.loads(answers)
    return {
        "id": str(row["id"]),
        "answers": answers,
        "created_at": row["created_at"].isoformat() if row["created_at"] else None,
        "updated_at": row["updated_at"].isoformat() if row["updated_at"] else None,
    }


@router.get("/me")
async def get_my_feedback(db: DB, user: CurrentUser):
    comp_id = await _active_competition_id(db)
    row = await db.fetchrow(
        "SELECT id, answers, created_at, updated_at FROM feedback_submissions WHERE user_id = $1 AND competition_id = $2",
        user["id"],
        comp_id,
    )
    if not row:
        return {"submission": None}
    return {"submission": _row_to_submission(row)}


@router.post("")
async def submit_feedback(data: FeedbackPayload, db: DB, user: CurrentUser):
    answers_json = json.dumps(data.answers, separators=(",", ":"))
    if len(answers_json.encode("utf-8")) > 64 * 1024:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail="Feedback payload exceeds 64 KiB",
        )
    comp_id = await _active_competition_id(db)
    exists = await db.fetchval(
        "SELECT 1 FROM feedback_submissions WHERE user_id = $1 AND competition_id = $2",
        user["id"],
        comp_id,
    )
    if exists:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Feedback already submitted")
    row = await db.fetchrow(
        """
        INSERT INTO feedback_submissions (user_id, competition_id, answers)
        VALUES ($1, $2, $3::jsonb)
        RETURNING id, answers, created_at, updated_at
        """,
        user["id"],
        comp_id,
        answers_json,
    )
    return {"submission": _row_to_submission(row)}


@router.get("/admin/submissions")
async def list_feedback_admin(admin: AdminUser, db: DB):
    comp_id = await _active_competition_id(db)
    rows = await db.fetch(
        """
        SELECT fs.id, fs.answers, fs.created_at, fs.updated_at, fs.user_id
        FROM feedback_submissions fs
        WHERE fs.competition_id = $1
        ORDER BY fs.updated_at DESC
        """,
        comp_id,
    )
    return {
        "count": len(rows),
        "submissions": [
            {
                "id": str(r["id"]),
                "user_id": str(r["user_id"]),
                "answers": json.loads(r["answers"]) if isinstance(r["answers"], str) else r["answers"],
                "created_at": r["created_at"].isoformat() if r["created_at"] else None,
                "updated_at": r["updated_at"].isoformat() if r["updated_at"] else None,
            }
            for r in rows
        ],
    }
