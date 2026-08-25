import asyncio

from shared import db
from shared.config import settings
from shared.observability import logger


async def watchdog_loop():
    while True:
        await asyncio.sleep(60)

        try:
            await requeue_expired_leases()
        except Exception as e:
            logger.exception("watchdog_error", error=str(e) or type(e).__name__)

        try:
            await cleanup_stale_uploads()
        except Exception as e:
            logger.error("stale_upload_cleanup_error", error=str(e) or type(e).__name__)


async def cleanup_stale_uploads():
    if settings.task_id is None:
        raise RuntimeError("TASK_ID is required")
    async with db.pool.acquire() as conn:
        result = await conn.fetch(
            """
            UPDATE submissions
            SET status = 'failed', last_error = 'Upload timed out', completed_at = NOW()
            WHERE status = 'uploading'
              AND task_id = $1
              AND queued_at < NOW() - INTERVAL '20 minutes'
            RETURNING id
            """,
            settings.task_id,
        )
        if result:
            logger.info("stale_uploads_cleaned", count=len(result))


async def requeue_expired_leases():
    if settings.task_id is None:
        raise RuntimeError("TASK_ID is required")
    async with db.pool.acquire() as conn:
        expired = await conn.fetch(
            """
            SELECT s.id, s.attempt_count, s.locked_by
            FROM submissions s
            WHERE s.status = 'processing'
              AND s.lease_expires_at < NOW()
              AND s.task_id = $1
            """,
            settings.task_id,
        )

        for sub in expired:
            if sub["attempt_count"] >= settings.max_retries:
                await conn.execute(
                    """
                    UPDATE submissions
                    SET status = 'failed',
                        last_error = 'Evaluation timed out. Check the submission and try again.',
                        completed_at = NOW()
                    WHERE id = $1 AND status = 'processing'
                      AND lease_expires_at < NOW() AND locked_by = $2
                    """,
                    sub["id"],
                    sub["locked_by"],
                )
                logger.warning(
                    "submission_max_retries",
                    submission_id=str(sub["id"]),
                    attempt_count=sub["attempt_count"],
                    last_worker=sub["locked_by"],
                )
            else:
                await conn.execute(
                    """
                    UPDATE submissions
                    SET status = 'queued',
                        locked_by = NULL,
                        locked_at = NULL,
                        lease_expires_at = NULL
                    WHERE id = $1 AND status = 'processing'
                      AND lease_expires_at < NOW() AND locked_by = $2
                    """,
                    sub["id"],
                    sub["locked_by"],
                )
                logger.info(
                    "submission_requeued",
                    submission_id=str(sub["id"]),
                    attempt_count=sub["attempt_count"],
                    last_worker=sub["locked_by"],
                )

        if expired:
            logger.info(
                "watchdog_cycle",
                task_id=str(settings.task_id),
                requeued=len(expired),
            )
