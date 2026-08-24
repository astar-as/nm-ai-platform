import json

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, Field, field_validator

from app.dependencies import DB, AdminUser, CurrentUser
from app.helpers import (
    compute_overall_rankings,
    get_competition_phase,
    get_user_team,
    require_captain,
)
from app.security import normalize_https_url

router = APIRouter()


class LinkItem(BaseModel):
    url: str = Field(max_length=2048)
    label: str = Field(min_length=1, max_length=200)

    @field_validator("url")
    @classmethod
    def validate_url(cls, v: str) -> str:
        try:
            return normalize_https_url(v)
        except ValueError as exc:
            raise ValueError("URL must be an absolute HTTPS URL without credentials") from exc


class FinalSubmissionCreate(BaseModel):
    links: list[LinkItem] = Field(min_length=1, max_length=5)
    notes: str | None = Field(default=None, max_length=2000)


@router.get("/status")
async def get_finals_status(db: DB):
    return await get_competition_phase(db)


@router.get("/submission")
async def get_final_submission(db: DB, user: CurrentUser):
    phase_info = await get_competition_phase(db)
    team = await get_user_team(db, user["id"], phase_info["competition_id"])
    if not team:
        return {"submission": None, "is_captain": False}

    is_captain = await db.fetchval(
        "SELECT EXISTS(SELECT 1 FROM team_members WHERE team_id = $1 AND user_id = $2 AND role = 'captain')",
        team["id"],
        user["id"],
    )

    row = await db.fetchrow(
        "SELECT id, links, notes, created_at, updated_at FROM final_submissions WHERE team_id = $1",
        team["id"],
    )

    if not row:
        return {"submission": None, "is_captain": is_captain}

    return {
        "submission": {
            "id": str(row["id"]),
            "links": json.loads(row["links"]) if isinstance(row["links"], str) else row["links"],
            "notes": row["notes"],
            "created_at": row["created_at"].isoformat() if row["created_at"] else None,
            "updated_at": row["updated_at"].isoformat() if row["updated_at"] else None,
        },
        "is_captain": is_captain,
    }


@router.post("/submission")
async def save_final_submission(data: FinalSubmissionCreate, db: DB, user: CurrentUser):
    phase_info = await get_competition_phase(db)
    if phase_info["phase"] == "closed":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Final submission deadline has passed.",
        )

    team = await get_user_team(db, user["id"], phase_info["competition_id"])
    if not team:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Not in a team")

    await require_captain(db, team["id"], user["id"], "submit final links")

    links_json = json.dumps([item.model_dump() for item in data.links])

    row = await db.fetchrow(
        """
        INSERT INTO final_submissions (team_id, competition_id, submitted_by, links, notes)
        VALUES ($1, $2::uuid, $3, $4::jsonb, $5)
        ON CONFLICT (team_id, competition_id) DO UPDATE
            SET links = EXCLUDED.links,
                notes = EXCLUDED.notes,
                submitted_by = EXCLUDED.submitted_by,
                updated_at = NOW()
        RETURNING id, links, notes, created_at, updated_at
        """,
        team["id"],
        phase_info["competition_id"],
        user["id"],
        links_json,
        data.notes,
    )

    return {
        "id": str(row["id"]),
        "links": json.loads(row["links"]) if isinstance(row["links"], str) else row["links"],
        "notes": row["notes"],
        "created_at": row["created_at"].isoformat() if row["created_at"] else None,
        "updated_at": row["updated_at"].isoformat() if row["updated_at"] else None,
    }


@router.get("/admin/submissions")
async def get_admin_submissions(admin: AdminUser, db: DB):
    comp = await db.fetchrow("SELECT id FROM competitions WHERE is_active = true LIMIT 1")
    if not comp:
        raise HTTPException(status_code=404, detail="No active competition")
    comp_id = comp["id"]

    entries, _ = await compute_overall_rankings(db, comp_id, revealed=True)
    score_map = {e["team_id"]: e for e in entries}

    teams = await db.fetch(
        """SELECT id, name, slug
           FROM teams WHERE competition_id = $1 AND deleted_at IS NULL""",
        comp_id,
    )
    submissions = await db.fetch(
        "SELECT team_id, links, notes, created_at, updated_at FROM final_submissions WHERE competition_id = $1",
        comp_id,
    )
    sub_map = {str(r["team_id"]): r for r in submissions}

    result_entries = []
    for t in teams:
        tid = str(t["id"])
        score_entry = score_map.get(tid)
        sub = sub_map.get(tid)

        overall_score = score_entry["overall_score"] if score_entry else 0
        raw_scores = score_entry["raw_scores"] if score_entry else {}

        links = None
        notes = None
        submitted_at = None
        if sub:
            links = json.loads(sub["links"]) if isinstance(sub["links"], str) else sub["links"]
            notes = sub["notes"]
            submitted_at = sub["updated_at"].isoformat() if sub["updated_at"] else sub["created_at"].isoformat() if sub["created_at"] else None

        result_entries.append({
            "team_id": tid,
            "team_name": t["name"],
            "team_slug": t["slug"],
            "overall_score": overall_score,
            "raw_scores": raw_scores,
            "links": links,
            "notes": notes,
            "submitted_at": submitted_at,
        })

    result_entries.sort(key=lambda e: e["overall_score"], reverse=True)
    for i, e in enumerate(result_entries):
        e["rank"] = i + 1

    return {"teams": result_entries}
