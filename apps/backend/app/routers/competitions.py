from datetime import datetime

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel

from app.dependencies import DB

router = APIRouter()


class CompetitionResponse(BaseModel):
    id: str
    slug: str
    name: str
    starts_at: datetime
    ends_at: datetime
    is_active: bool


@router.get("", response_model=list[CompetitionResponse])
async def list_competitions(db: DB):
    rows = await db.fetch("SELECT id, slug, name, starts_at, ends_at, is_active FROM competitions ORDER BY starts_at DESC")
    return [CompetitionResponse(id=str(r["id"]), slug=r["slug"], name=r["name"], starts_at=r["starts_at"], ends_at=r["ends_at"], is_active=r["is_active"]) for r in rows]


@router.get("/current", response_model=CompetitionResponse)
async def get_current_competition(db: DB):
    row = await db.fetchrow("SELECT id, slug, name, starts_at, ends_at, is_active FROM competitions WHERE is_active = true LIMIT 1")
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No active competition")
    return CompetitionResponse(id=str(row["id"]), slug=row["slug"], name=row["name"], starts_at=row["starts_at"], ends_at=row["ends_at"], is_active=row["is_active"])


@router.get("/{slug}", response_model=CompetitionResponse)
async def get_competition(slug: str, db: DB):
    row = await db.fetchrow("SELECT id, slug, name, starts_at, ends_at, is_active FROM competitions WHERE slug = $1", slug)
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND)
    return CompetitionResponse(id=str(row["id"]), slug=row["slug"], name=row["name"], starts_at=row["starts_at"], ends_at=row["ends_at"], is_active=row["is_active"])


@router.get("/{slug}/tasks")
async def get_competition_tasks(slug: str, db: DB):
    comp = await db.fetchrow("SELECT id FROM competitions WHERE slug = $1", slug)
    if not comp:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND)

    rows = await db.fetch(
        """SELECT t.id, t.slug, t.name, t.description, t.submission_mode,
                  t.is_active, t.opens_at, t.closes_at, t.max_response_time_ms
           FROM tasks t JOIN competitions c ON c.id = t.competition_id
           WHERE t.competition_id = $1 AND t.is_active = true
             AND COALESCE(t.reveals_at, c.starts_at) <= NOW()
           ORDER BY t.slug""",
        comp["id"],
    )
    return [{"id": str(r["id"]), "slug": r["slug"], "name": r["name"], "description": r["description"], "submission_mode": r["submission_mode"], "is_active": r["is_active"], "opens_at": r["opens_at"], "closes_at": r["closes_at"], "max_response_time_ms": r["max_response_time_ms"]} for r in rows]
