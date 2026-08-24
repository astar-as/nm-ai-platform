import asyncio

import uvicorn
from shared import db
from shared.claim import ClaimedSubmission, claim_submissions
from shared.config import settings
from shared.health import health_app
from shared.leaderboard import fail_submission, update_leaderboard
from shared.observability import logger, start_metrics_server, update_queue_metrics
from shared.scorer_base import BaseScorer, ScoreResult
from shared.watchdog import watchdog_loop

TEMPLATE_READY = False


class TemplateScorer(BaseScorer):
    """Replace this class with deterministic, task-specific scoring logic."""

    def score(self, predictions: list[dict], ground_truth: list[dict]) -> ScoreResult:
        raise NotImplementedError("Implement task scoring before running this validator")


async def evaluate(submission: ClaimedSubmission) -> None:
    logger.info("evaluating", submission_id=str(submission.id))
    try:
        # A real validator loads private test data, evaluates the endpoint or
        # sandboxed artifact, and passes only bounded metrics to the platform.
        predictions = [{"endpoint_url": submission.endpoint_url}]
        result = TemplateScorer().score(predictions, ground_truth=[])

        await update_leaderboard(
            submission_id=submission.id,
            team_id=submission.team_id,
            task_id=submission.task_id,
            score=result.score,
            metrics=result.metrics,
            duration_ms=0,
            http_status=200,
            worker_id=settings.worker_id,
        )
        logger.info("evaluated", submission_id=str(submission.id), score=result.score)
    except Exception:
        logger.exception("evaluation_failed", submission_id=str(submission.id))
        await fail_submission(
            submission.id,
            "failed",
            "Evaluation failed",
            error_type="execution",
            worker_id=settings.worker_id,
        )


async def worker_loop() -> None:
    while True:
        submissions = await claim_submissions(settings.batch_size, settings.worker_id)
        if not submissions:
            await asyncio.sleep(settings.poll_interval)
            continue
        await asyncio.gather(*(evaluate(s) for s in submissions))


async def main() -> None:
    if settings.task_id is None:
        raise RuntimeError("TASK_ID is required")
    if not TEMPLATE_READY:
        raise RuntimeError("Implement TemplateScorer and set TEMPLATE_READY=true before starting")
    await db.init_pool()
    start_metrics_server()

    server = uvicorn.Server(uvicorn.Config(health_app, host="0.0.0.0", port=settings.health_port, log_level="warning"))
    try:
        await asyncio.gather(
            worker_loop(),
            watchdog_loop(),
            update_queue_metrics(db.pool, str(settings.task_id)),
            server.serve(),
        )
    finally:
        await db.close_pool()


if __name__ == "__main__":
    asyncio.run(main())
