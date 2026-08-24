from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, status

from app.dependencies import DB

router = APIRouter()


async def _require_public_scores(db, slug: str):
    comp = await db.fetchrow(
        """SELECT id, ends_at, leaderboard_revealed
           FROM competitions WHERE slug = $1""",
        slug,
    )
    if not comp:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND)
    ends_at = comp["ends_at"]
    if ends_at.tzinfo is None:
        ends_at = ends_at.replace(tzinfo=timezone.utc)
    if datetime.now(timezone.utc) >= ends_at and not comp["leaderboard_revealed"]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Scores are closed while final results are reviewed",
        )
    return comp


@router.get("/competitions/{slug}/livestream/recent")
async def get_recent_submissions(slug: str, db: DB):
    comp = await _require_public_scores(db, slug)

    rows = await db.fetch(
        """
        SELECT s.id, s.status, s.queued_at, s.started_at, s.completed_at,
               t.name as team_name,
               tk.name as task_name, tk.submission_mode,
               e.score
        FROM submissions s
        JOIN teams t ON t.id = s.team_id
        JOIN tasks tk ON tk.id = s.task_id
        JOIN competitions c ON c.id = tk.competition_id
        LEFT JOIN evaluations e ON e.submission_id = s.id
        WHERE tk.competition_id = $1 AND tk.is_active = true
          AND COALESCE(tk.reveals_at, c.starts_at) <= NOW()
        ORDER BY s.queued_at DESC
        LIMIT 15
        """,
        comp["id"],
    )

    return [
        {
            "id": str(r["id"]),
            "team_name": r["team_name"],
            "task_name": r["task_name"],
            "submission_mode": r["submission_mode"],
            "status": r["status"],
            "score": float(r["score"]) if r["score"] is not None else None,
            "queued_at": r["queued_at"].isoformat() if r["queued_at"] else None,
            "completed_at": r["completed_at"].isoformat() if r["completed_at"] else None,
        }
        for r in rows
    ]


@router.get("/competitions/{slug}/livestream/stats")
async def get_competition_stats(slug: str, db: DB):
    comp = await _require_public_scores(db, slug)

    comp_id = comp["id"]

    total_teams = await db.fetchval(
        "SELECT COUNT(*) FROM teams WHERE competition_id = $1", comp_id
    )

    total_submissions = await db.fetchval(
        """
        SELECT COUNT(*) FROM submissions s
        JOIN tasks tk ON tk.id = s.task_id
        JOIN competitions c ON c.id = tk.competition_id
        WHERE tk.competition_id = $1 AND tk.is_active = true
          AND COALESCE(tk.reveals_at, c.starts_at) <= NOW()
        """,
        comp_id,
    )

    completed_submissions = await db.fetchval(
        """
        SELECT COUNT(*) FROM submissions s
        JOIN tasks tk ON tk.id = s.task_id
        JOIN competitions c ON c.id = tk.competition_id
        WHERE tk.competition_id = $1 AND tk.is_active = true
          AND COALESCE(tk.reveals_at, c.starts_at) <= NOW()
          AND s.status = 'completed'
        """,
        comp_id,
    )

    failed_submissions = await db.fetchval(
        """
        SELECT COUNT(*) FROM submissions s
        JOIN tasks tk ON tk.id = s.task_id
        JOIN competitions c ON c.id = tk.competition_id
        WHERE tk.competition_id = $1 AND tk.is_active = true
          AND COALESCE(tk.reveals_at, c.starts_at) <= NOW()
          AND s.status = 'failed'
        """,
        comp_id,
    )

    active_tasks = await db.fetchval(
        """SELECT COUNT(*) FROM tasks t JOIN competitions c ON c.id = t.competition_id
           WHERE t.competition_id = $1 AND t.is_active = true
             AND COALESCE(t.reveals_at, c.starts_at) <= NOW()""",
        comp_id,
    )

    top_scores = await db.fetch(
        """
        SELECT tk.name as task_name, tk.slug AS task_slug, tk.submission_mode,
               CASE
                 WHEN COALESCE(tk.scoring_config->>'score_direction', 'maximize') = 'minimize'
                 THEN MIN(ls.best_score)
                 ELSE MAX(ls.best_score)
               END as top_score
        FROM tasks tk
        JOIN competitions c ON c.id = tk.competition_id
        LEFT JOIN leaderboard_scores ls ON ls.task_id = tk.id
        WHERE tk.competition_id = $1 AND tk.is_active = true
          AND COALESCE(tk.reveals_at, c.starts_at) <= NOW()
        GROUP BY tk.id, tk.name, tk.slug, tk.submission_mode
        ORDER BY tk.slug
        """,
        comp_id,
    )

    success_rate = (
        round(completed_submissions / total_submissions * 100, 1)
        if total_submissions > 0
        else 0
    )

    return {
        "total_teams": total_teams,
        "total_submissions": total_submissions,
        "completed_submissions": completed_submissions,
        "failed_submissions": failed_submissions,
        "success_rate": success_rate,
        "active_tasks": active_tasks,
        "top_scores": [
            {
                "task_name": r["task_name"],
                "submission_mode": r["submission_mode"],
                "top_score": float(r["top_score"]) if r["top_score"] is not None else None,
            }
            for r in top_scores
        ],
    }
