import math
from datetime import datetime, timedelta, timezone

from fastapi import HTTPException, status

REPO_GRACE_MINUTES = 15


async def get_active_competition_id(db) -> str:
    comp = await db.fetchrow("SELECT id FROM competitions WHERE is_active = true LIMIT 1")
    if not comp:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No active competition")
    return comp["id"]


async def get_team_for_competition(db, competition_id: str, user_id: str) -> dict | None:
    row = await db.fetchrow(
        "SELECT t.id FROM teams t JOIN team_members tm ON tm.team_id = t.id WHERE t.competition_id = $1 AND tm.user_id = $2",
        competition_id,
        user_id,
    )
    return dict(row) if row else None


async def get_user_team(db, user_id: str, competition_id: str) -> dict | None:
    row = await db.fetchrow(
        """SELECT t.id FROM teams t
           JOIN team_members tm ON tm.team_id = t.id
           WHERE tm.user_id = $1 AND t.competition_id = $2 AND t.deleted_at IS NULL""",
        user_id,
        competition_id,
    )
    return dict(row) if row else None


async def check_roster_locked(db, team_id: str) -> None:
    locked = await db.fetchval("SELECT roster_locked_at FROM teams WHERE id = $1", team_id)
    if locked:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Team roster is locked after first submission")


async def require_captain(db, team_id: str, user_id: str, action: str = "perform this action") -> None:
    captain = await db.fetchrow(
        "SELECT id FROM team_members WHERE team_id = $1 AND user_id = $2 AND role = 'captain'",
        team_id,
        user_id,
    )
    if not captain:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=f"Only the captain can {action}")


async def get_competition_phase(db) -> dict:
    comp = await db.fetchrow(
        "SELECT id, ends_at, leaderboard_revealed FROM competitions WHERE is_active = true LIMIT 1"
    )
    if not comp:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No active competition")

    ends_at = comp["ends_at"]
    if ends_at.tzinfo is None:
        ends_at = ends_at.replace(tzinfo=timezone.utc)

    repo_deadline = ends_at + timedelta(minutes=REPO_GRACE_MINUTES)
    now = datetime.now(timezone.utc)
    revealed = comp["leaderboard_revealed"] or False

    if revealed:
        phase = "revealed"
    elif now < ends_at:
        phase = "open"
    elif now < repo_deadline:
        phase = "grace"
    else:
        phase = "closed"

    return {
        "phase": phase,
        "competition_end": ends_at.isoformat(),
        "repo_deadline": repo_deadline.isoformat(),
        "competition_id": str(comp["id"]),
    }


async def compute_overall_rankings(db, comp_id, revealed: bool = False) -> tuple[list[dict], dict]:
    """Compute normalized overall rankings across all tasks in the competition.

    Each task's scores are normalized to fixed operator-configured bounds using
    its score direction, then combined using optional task weights. When
    revealed=True, private evaluations from the latest evaluation round take
    precedence over public scores.

    Returns (entries, max_scores) where entries is a list of dicts sorted by
    overall_score DESC, each containing: team_id, team_name, team_slug,
    raw_scores, normalized_scores, overall_score, rank; max_scores maps
    task_slug -> best raw score.
    """
    tasks = await db.fetch(
        """SELECT t.id, t.slug, t.scoring_config
           FROM tasks t JOIN competitions c ON c.id = t.competition_id
           WHERE t.competition_id = $1
             AND ($2 OR COALESCE(t.reveals_at, c.starts_at) <= NOW())
           ORDER BY t.slug""",
        comp_id,
        revealed,
    )

    task_scores: dict[str, dict[str, float]] = {}
    max_scores: dict[str, float] = {}
    directions: dict[str, str] = {}
    weights: dict[str, float] = {}
    normalization_bounds: dict[str, tuple[float, float] | None] = {}
    for task in tasks:
        slug = task["slug"].replace("-", "_")
        rows = []
        if revealed:
            rows = await db.fetch(
                """SELECT pe.team_id, pe.private_score as score
                   FROM private_evaluations pe
                   WHERE pe.task_id = $1
                     AND pe.evaluation_round = (
                         SELECT MAX(evaluation_round) FROM private_evaluations WHERE task_id = $1
                     )""",
                task["id"],
            )
        if not rows:
            rows = await db.fetch(
                """SELECT ls.team_id, ls.best_score as score
                   FROM leaderboard_scores ls
                   JOIN teams t ON t.id = ls.team_id
                   WHERE ls.task_id = $1 AND t.deleted_at IS NULL AND ls.best_score IS NOT NULL""",
                task["id"],
            )
        scores = {str(r["team_id"]): float(r["score"]) for r in rows}
        task_scores[slug] = scores
        config = task["scoring_config"] or {}
        direction = config.get("score_direction", "maximize")
        directions[slug] = direction if direction in {"maximize", "minimize"} else "maximize"
        try:
            weights[slug] = max(0.0, min(100.0, float(config.get("overall_weight", 1))))
        except (TypeError, ValueError):
            weights[slug] = 1.0
        try:
            low = float(config["normalization_min"])
            high = float(config["normalization_max"])
            normalization_bounds[slug] = (
                (low, high) if math.isfinite(low) and math.isfinite(high) and high > low else None
            )
        except (KeyError, TypeError, ValueError):
            normalization_bounds[slug] = None
        if normalization_bounds[slug] is None:
            weights[slug] = 0.0
        if scores:
            max_scores[slug] = (
                min(scores.values()) if directions[slug] == "minimize" else max(scores.values())
            )
        else:
            max_scores[slug] = 0

    teams = await db.fetch(
        """SELECT id, name, slug
           FROM teams WHERE competition_id = $1 AND deleted_at IS NULL""",
        comp_id,
    )

    entries = []
    for t in teams:
        tid = str(t["id"])
        raw = {slug: scores.get(tid) for slug, scores in task_scores.items()}

        if all(v is None for v in raw.values()):
            continue

        normalized: dict[str, float] = {}
        for slug in task_scores:
            score = raw[slug]
            bounds = normalization_bounds[slug]
            if score is None or bounds is None:
                normalized[slug] = 0
                continue
            low, high = bounds
            bounded_score = max(low, min(high, score))
            if directions[slug] == "minimize":
                normalized[slug] = round((high - bounded_score) / (high - low) * 100, 2)
            else:
                normalized[slug] = round((bounded_score - low) / (high - low) * 100, 2)

        weight_total = sum(weights.values())
        overall = (
            sum(normalized[slug] * weights[slug] for slug in normalized) / weight_total
            if weight_total
            else 0
        )

        entries.append({
            "team_id": tid,
            "team_name": t["name"],
            "team_slug": t["slug"],
            "raw_scores": raw,
            "normalized_scores": normalized,
            "overall_score": round(overall, 2),
        })

    entries.sort(key=lambda e: e["overall_score"], reverse=True)
    for i, e in enumerate(entries):
        e["rank"] = i + 1

    return entries, max_scores


async def check_competition_open(db, competition_id: str, task_id: str | None = None) -> None:
    comp = await db.fetchrow(
        "SELECT starts_at, ends_at FROM competitions WHERE id = $1", competition_id
    )
    if not comp:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Competition not found")
    now = datetime.now(timezone.utc)
    starts_at = comp["starts_at"]
    ends_at = comp["ends_at"]
    if starts_at.tzinfo is None:
        starts_at = starts_at.replace(tzinfo=timezone.utc)
    if ends_at.tzinfo is None:
        ends_at = ends_at.replace(tzinfo=timezone.utc)
    if now < starts_at:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Competition has not started. No submissions accepted.",
        )
    if now >= ends_at:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Competition has ended. No new submissions accepted.",
        )
    if task_id:
        task = await db.fetchrow(
            "SELECT opens_at, closes_at FROM tasks WHERE id = $1 AND competition_id = $2",
            task_id,
            competition_id,
        )
        if not task:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Task not found")
        opens_at = task["opens_at"]
        closes_at = task["closes_at"]
        if opens_at and now < _as_utc(opens_at):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Task is not open")
        if closes_at and now >= _as_utc(closes_at):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Task has closed")


def _as_utc(value: datetime) -> datetime:
    return value if value.tzinfo else value.replace(tzinfo=timezone.utc)


async def get_submission_quota(db, team_id, task_id, limits: dict) -> dict:
    row = await db.fetchrow(
        """
        SELECT
            COUNT(*) FILTER (WHERE status IN ('queued','processing','scoring')) AS in_flight,
            COUNT(*) FILTER (WHERE status = 'uploading') AS uploading,
            COUNT(*) FILTER (
                WHERE queued_at >= date_trunc('day', NOW() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'
                  AND status != 'uploading'
                  AND (error_type IS NULL OR error_type != 'infrastructure')
            ) AS daily_used,
            COUNT(*) FILTER (
                WHERE queued_at >= date_trunc('day', NOW() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'
                  AND error_type = 'infrastructure'
            ) AS daily_infra
        FROM submissions WHERE team_id = $1 AND task_id = $2
        """,
        team_id,
        task_id,
    )
    ban = await db.fetchrow(
        "SELECT reason FROM team_bans WHERE team_id = $1 AND task_id = $2",
        team_id,
        task_id,
    )
    try:
        max_per_day = max(1, min(1000, int(limits.get("max_per_day", 20))))
        freebies = max(0, min(100, int(limits.get("infra_freebies_per_day", 2))))
        max_in_flight = max(1, min(20, int(limits.get("max_in_flight", 2))))
    except (ValueError, TypeError):
        max_per_day, freebies, max_in_flight = 20, 2, 2
    infra_penalty = max(0, row["daily_infra"] - freebies)
    effective_limit = max(0, max_per_day - infra_penalty)
    in_flight = row["in_flight"] + row["uploading"]
    return {
        "daily_used": row["daily_used"],
        "daily_limit": effective_limit,
        "max_per_day": max_per_day,
        "infra_used": row["daily_infra"],
        "infra_freebies": freebies,
        "in_flight": in_flight,
        "max_in_flight": max_in_flight,
        "remaining": max(0, effective_limit - row["daily_used"]),
        "is_banned": ban is not None,
        "ban_reason": ban["reason"] if ban else None,
        "resets_at": "00:00 UTC",
        "can_submit": ban is None and in_flight < max_in_flight and row["daily_used"] < effective_limit,
    }
