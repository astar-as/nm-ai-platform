import time
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, status

from app.dependencies import DB
from app.helpers import compute_overall_rankings

_cache: dict[str, tuple[float, object]] = {}
CACHE_TTL = 10


def _cached(key: str):
    entry = _cache.get(key)
    if entry and time.time() - entry[0] < CACHE_TTL:
        return entry[1]
    return None


def _set_cache(key: str, value: object):
    _cache[key] = (time.time(), value)


router = APIRouter()

CLOSED_RESPONSE = {
    "closed_for_review": True,
    "message": "Leaderboard is closed while final results are reviewed.",
}


async def _check_leaderboard_closed(db, comp_id) -> tuple[bool, bool]:
    row = await db.fetchrow(
        "SELECT ends_at, leaderboard_revealed FROM competitions WHERE id = $1", comp_id
    )
    if not row or not row["ends_at"]:
        return False, False
    ends_at = row["ends_at"]
    if ends_at.tzinfo is None:
        ends_at = ends_at.replace(tzinfo=timezone.utc)
    revealed = row["leaderboard_revealed"] or False
    if revealed:
        return False, True
    past_end = datetime.now(timezone.utc) >= ends_at
    return past_end, False


@router.get("/competitions/{slug}/leaderboard")
async def get_leaderboard(slug: str, db: DB):
    comp = await db.fetchrow("SELECT id FROM competitions WHERE slug = $1", slug)
    if not comp:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND)

    is_closed, is_revealed = await _check_leaderboard_closed(db, comp["id"])
    if is_closed:
        return {**CLOSED_RESPONSE, "data": []}

    cache_key = f"lb:{slug}:{'r' if is_revealed else 'n'}"
    cached = _cached(cache_key)
    if cached is not None:
        return cached

    entries, _ = await compute_overall_rankings(db, comp["id"], revealed=is_revealed)
    result = [
        {
            "rank": entry["rank"],
            "team_id": entry["team_id"],
            "team_name": entry["team_name"],
            "team_slug": entry["team_slug"],
            "total_score": entry["overall_score"],
            "tasks_completed": sum(v is not None for v in entry["raw_scores"].values()),
        }
        for entry in entries
    ]
    _set_cache(cache_key, result)
    return result


@router.get("/competitions/{slug}/leaderboard/overall")
async def get_overall_leaderboard(slug: str, db: DB):
    comp = await db.fetchrow("SELECT id FROM competitions WHERE slug = $1", slug)
    if not comp:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND)

    is_closed, is_revealed = await _check_leaderboard_closed(db, comp["id"])
    if is_closed:
        return {**CLOSED_RESPONSE, "max_scores": {}, "rankings": []}

    cache_suffix = "r" if is_revealed else "n"
    cached = _cached(f"lb-overall:{slug}:{cache_suffix}")
    if cached is not None:
        return cached

    entries, max_scores = await compute_overall_rankings(db, comp["id"], is_revealed)

    result = {
        "max_scores": max_scores,
        "rankings": entries,
    }
    _set_cache(f"lb-overall:{slug}:{cache_suffix}", result)
    return result


@router.get("/competitions/{slug}/leaderboard/{task_slug}")
async def get_task_leaderboard(slug: str, task_slug: str, db: DB):
    comp = await db.fetchrow("SELECT id FROM competitions WHERE slug = $1", slug)
    if not comp:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND)

    is_closed, is_revealed = await _check_leaderboard_closed(db, comp["id"])
    if is_closed:
        return {**CLOSED_RESPONSE, "data": []}

    cache_key = f"lb-task:{slug}:{task_slug}:{'r' if is_revealed else 'n'}"
    cached = _cached(cache_key)
    if cached is not None:
        return cached

    task = await db.fetchrow(
        """SELECT t.id, t.scoring_config FROM tasks t
           JOIN competitions c ON c.id = t.competition_id
           WHERE t.competition_id = $1 AND t.slug = $2
             AND t.is_active = true
             AND ($3 OR COALESCE(t.reveals_at, c.starts_at) <= NOW())""",
        comp["id"],
        task_slug,
        is_revealed,
    )
    if not task:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND)

    direction = (task["scoring_config"] or {}).get("score_direction", "maximize")
    order = "ASC" if direction == "minimize" else "DESC"
    if is_revealed:
        rows = await db.fetch(
            f"""
            SELECT t.id, t.name, t.slug,
                   pe.private_score AS best_score, 0 AS total_submissions,
                   pe.evaluated_at AS last_submission_at
            FROM private_evaluations pe JOIN teams t ON t.id = pe.team_id
            WHERE pe.task_id = $1 AND t.deleted_at IS NULL
              AND pe.evaluation_round = (
                  SELECT MAX(evaluation_round) FROM private_evaluations WHERE task_id = $1
              )
            ORDER BY pe.private_score {order}, pe.evaluated_at ASC
            """,
            task["id"],
        )
    else:
        rows = []
    if not rows:
        rows = await db.fetch(
            f"""
            SELECT t.id, t.name, t.slug,
                   ls.best_score, ls.total_submissions, ls.last_submission_at
            FROM leaderboard_scores ls JOIN teams t ON t.id = ls.team_id
            WHERE ls.task_id = $1 AND t.deleted_at IS NULL
            ORDER BY ls.best_score {order}, ls.last_submission_at ASC
            """,
            task["id"],
        )

    team_ids = [r["id"] for r in rows]
    members_map: dict[str, list[dict]] = {}

    if team_ids:
        member_rows = await db.fetch(
            """
            SELECT tm.team_id, u.name, u.avatar_url
            FROM team_members tm JOIN users u ON u.id = tm.user_id
            WHERE tm.team_id = ANY($1)
            """,
            team_ids,
        )
        for mr in member_rows:
            tid = str(mr["team_id"])
            members_map.setdefault(tid, []).append({"name": mr["name"], "avatar_url": mr["avatar_url"]})

    result = [
        {
            "rank": idx + 1,
            "team_id": str(r["id"]),
            "team_name": r["name"],
            "team_slug": r["slug"],
            "score": float(r["best_score"]) if r["best_score"] is not None else None,
            "total_submissions": r["total_submissions"],
            "last_submission_at": r["last_submission_at"],
            "members": members_map.get(str(r["id"]), []),
        }
        for idx, r in enumerate(rows)
    ]
    _set_cache(cache_key, result)
    return result
