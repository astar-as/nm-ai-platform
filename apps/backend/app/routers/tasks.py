from fastapi import APIRouter, HTTPException, status

from app.dependencies import DB

router = APIRouter()


PUBLIC_SCORING_KEYS = {
    "submission_limits",
    "max_upload_mb",
    "max_predictions_per_image",
    "normalization_min",
    "normalization_max",
    "overall_weight",
    "score_direction",
}


def _task_response(row):
    scoring_config = row["scoring_config"] if row["scoring_config"] else {}
    public_config = {k: v for k, v in scoring_config.items() if k in PUBLIC_SCORING_KEYS}
    return {
        "id": str(row["id"]),
        "slug": row["slug"],
        "name": row["name"],
        "description": row["description"],
        "submission_mode": row["submission_mode"],
        "endpoint_schema": row["endpoint_schema"],
        "max_response_time_ms": row["max_response_time_ms"],
        "is_active": row["is_active"],
        "opens_at": row["opens_at"],
        "closes_at": row["closes_at"],
        "scoring_config": public_config,
    }


@router.get("/by-slug/{slug}")
async def get_task_by_slug(slug: str, db: DB):
    row = await db.fetchrow(
        """SELECT t.id, t.slug, t.name, t.description, t.submission_mode,
                  t.endpoint_schema, t.max_response_time_ms, t.is_active,
                  t.opens_at, t.closes_at, t.scoring_config
           FROM tasks t JOIN competitions c ON c.id = t.competition_id
           WHERE t.slug = $1 AND c.is_active = true
             AND COALESCE(t.reveals_at, c.starts_at) <= NOW()""",
        slug,
    )
    if not row or not row["is_active"]:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND)
    return _task_response(row)


@router.get("/{task_id}")
async def get_task(task_id: str, db: DB):
    row = await db.fetchrow(
        """SELECT t.id, t.slug, t.name, t.description, t.submission_mode,
                  t.endpoint_schema, t.max_response_time_ms, t.is_active,
                  t.opens_at, t.closes_at, t.scoring_config
           FROM tasks t JOIN competitions c ON c.id = t.competition_id
           WHERE t.id = $1 AND c.is_active = true
             AND COALESCE(t.reveals_at, c.starts_at) <= NOW()""",
        task_id,
    )
    if not row or not row["is_active"]:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND)
    return _task_response(row)
