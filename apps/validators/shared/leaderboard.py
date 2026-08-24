import math
from dataclasses import dataclass
from uuid import UUID

from shared import db
from shared.config import settings


@dataclass
class LeaderboardResult:
    is_new_best: bool
    old_best_artifact_path: str | None


class LeaseLostError(RuntimeError):
    pass


async def update_leaderboard(
    submission_id: UUID,
    team_id: UUID,
    task_id: UUID,
    score: float,
    metrics: dict,
    duration_ms: int,
    http_status: int,
    worker_id: str,
) -> LeaderboardResult:
    if not math.isfinite(score):
        score = 0.0
    async with db.pool.acquire() as conn:
        async with conn.transaction():
            completed = await conn.fetchval(
                """
                UPDATE submissions
                SET status = 'completed', completed_at = NOW()
                WHERE id = $1 AND status = 'processing' AND locked_by = $2
                  AND lease_expires_at > NOW()
                RETURNING id
                """,
                submission_id,
                worker_id,
            )
            if not completed:
                raise LeaseLostError(f"Lease lost for submission {submission_id}")

            old_best_id = await conn.fetchval(
                "SELECT best_submission_id FROM leaderboard_scores WHERE team_id = $1 AND task_id = $2",
                team_id, task_id,
            )

            await conn.execute(
                """
                INSERT INTO evaluations (
                    submission_id, score, metrics, duration_ms,
                    http_status, scoring_version
                ) VALUES ($1, $2, $3, $4, $5, $6)
                """,
                submission_id,
                score,
                metrics,
                duration_ms,
                http_status,
                settings.scoring_version,
            )

            updated = await conn.fetchrow(
                "SELECT best_submission_id FROM leaderboard_scores WHERE team_id = $1 AND task_id = $2",
                team_id, task_id,
            )
            is_new_best = updated is not None and updated["best_submission_id"] == submission_id

            old_best_artifact_path = None
            if is_new_best and old_best_id and old_best_id != submission_id:
                old_best_artifact_path = await conn.fetchval(
                    "SELECT artifact_path FROM submissions WHERE id = $1",
                    old_best_id,
                )

            await conn.execute(
                "UPDATE teams SET last_eval_at = NOW() WHERE id = $1",
                team_id,
            )

    return LeaderboardResult(
        is_new_best=is_new_best,
        old_best_artifact_path=old_best_artifact_path,
    )


async def fail_submission(
    submission_id: UUID,
    status: str,
    error_message: str,
    error_type: str | None = None,
    worker_id: str | None = None,
):
    async with db.pool.acquire() as conn:
        result = await conn.execute(
            """
            UPDATE submissions
            SET status = $2,
                last_error = $3,
                error_type = $4,
                completed_at = NOW()
            WHERE id = $1
              AND ($5::text IS NULL OR (status = 'processing' AND locked_by = $5 AND lease_expires_at > NOW()))
            """,
            submission_id,
            status,
            error_message,
            error_type,
            worker_id,
        )
        if worker_id and result == "UPDATE 0":
            raise LeaseLostError(f"Lease lost for submission {submission_id}")
