from dataclasses import dataclass, field
from datetime import datetime
from uuid import UUID

from shared import db
from shared.config import settings
from shared.observability import logger
from shared.secrets import decrypt_submission_secret


@dataclass
class ClaimedSubmission:
    id: UUID
    team_id: UUID
    task_id: UUID
    submission_mode: str
    endpoint_url: str | None
    endpoint_api_key: str | None = field(repr=False)
    artifact_path: str | None
    attempt_count: int
    queued_at: datetime


async def claim_submissions(batch_size: int, worker_id: str) -> list[ClaimedSubmission]:
    if settings.task_id is None:
        raise RuntimeError("TASK_ID is required; a validator must never claim every task")

    query = """
    WITH to_claim AS (
        SELECT s.id
        FROM submissions s
        JOIN teams t ON t.id = s.team_id
        WHERE s.task_id = $1
          AND (
              s.status = 'queued'
              OR (s.status = 'processing' AND s.lease_expires_at < NOW())
          )
        ORDER BY t.last_eval_at NULLS FIRST, s.queued_at
        LIMIT $2
        FOR UPDATE OF s SKIP LOCKED
    )
    UPDATE submissions
    SET status = 'processing',
        locked_by = $3,
        locked_at = NOW(),
        lease_expires_at = NOW() + make_interval(secs => $4),
        attempt_count = attempt_count + 1,
        started_at = COALESCE(started_at, NOW())
    WHERE id IN (SELECT id FROM to_claim)
    RETURNING id, team_id, task_id,
              (SELECT submission_mode FROM tasks WHERE id = submissions.task_id) as submission_mode,
              endpoint_url, endpoint_api_key, artifact_path, attempt_count, queued_at
    """

    async with db.pool.acquire() as conn:
        rows = await conn.fetch(
            query,
            settings.task_id,
            max(1, min(batch_size, 100)),
            worker_id,
            int(settings.lease_duration_seconds),
        )

    if rows:
        logger.info("submissions_claimed", worker_id=worker_id, count=len(rows),
                     ids=[str(row["id"]) for row in rows])

    claimed = []
    for row in rows:
        try:
            endpoint_api_key = decrypt_submission_secret(row["endpoint_api_key"])
        except ValueError:
            logger.exception("submission_secret_decryption_failed", submission_id=str(row["id"]))
            async with db.pool.acquire() as conn:
                await conn.execute(
                    """
                    UPDATE submissions
                    SET status = 'failed', completed_at = NOW(),
                        last_error = 'Submission credentials could not be loaded',
                        error_type = 'infrastructure'
                    WHERE id = $1 AND status = 'processing' AND locked_by = $2
                    """,
                    row["id"],
                    worker_id,
                )
            continue
        claimed.append(
            ClaimedSubmission(
                id=row["id"],
                team_id=row["team_id"],
                task_id=row["task_id"],
                submission_mode=row["submission_mode"],
                endpoint_url=row["endpoint_url"],
                endpoint_api_key=endpoint_api_key,
                artifact_path=row["artifact_path"],
                attempt_count=row["attempt_count"],
                queued_at=row["queued_at"],
            )
        )
    return claimed


async def extend_lease(submission_id: UUID, worker_id: str) -> bool:
    query = """
    UPDATE submissions
    SET lease_expires_at = NOW() + make_interval(secs => $3)
    WHERE id = $1 AND locked_by = $2 AND status = 'processing'
    RETURNING id
    """

    async with db.pool.acquire() as conn:
        result = await conn.fetchval(query, submission_id, worker_id, int(settings.lease_duration_seconds))

    if not result:
        logger.warning("lease_extend_failed", submission_id=str(submission_id), worker_id=worker_id)

    return result is not None
