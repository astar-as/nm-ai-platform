import asyncio

import structlog
from prometheus_client import Counter, Gauge, Histogram, start_http_server

from shared.config import settings

structlog.configure(
    processors=[
        structlog.processors.TimeStamper(fmt="iso"),
        structlog.processors.add_log_level,
        structlog.processors.format_exc_info,
        structlog.processors.JSONRenderer(),
    ]
)

logger = structlog.get_logger()

SUBMISSIONS_CLAIMED = Counter(
    "validator_submissions_claimed_total",
    "Submissions claimed from queue",
    ["worker_id"],
)

SUBMISSIONS_COMPLETED = Counter(
    "validator_submissions_completed_total",
    "Submissions completed",
    ["worker_id", "task_id", "status"],
)

EVAL_DURATION = Histogram(
    "validator_eval_duration_seconds",
    "Time to evaluate a submission",
    ["task_id"],
    buckets=[0.5, 1, 2, 5, 10, 30, 60, 120, 300],
)


QUEUE_DEPTH = Gauge(
    "validator_queue_depth",
    "Current queue depth",
    ["status", "task_id"],
)

ACTIVE_EVALS = Gauge(
    "validator_active_evaluations",
    "Currently running evaluations",
    ["worker_id"],
)

SCORES = Histogram(
    "validator_submission_scores",
    "Distribution of submission scores",
    ["task_id"],
    buckets=[0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0],
)


async def update_queue_metrics(pool, task_id: str = ""):
    while True:
        try:
            async with pool.acquire() as conn:
                if task_id:
                    queued = await conn.fetchval(
                        """
                        SELECT COUNT(*) FROM submissions s
                        WHERE s.status = 'queued' AND s.task_id = $1
                        """,
                        task_id,
                    )
                    processing = await conn.fetchval(
                        """
                        SELECT COUNT(*) FROM submissions s
                        WHERE s.status = 'processing' AND s.task_id = $1
                        """,
                        task_id,
                    )
                else:
                    queued = await conn.fetchval(
                        "SELECT COUNT(*) FROM submissions WHERE status = 'queued'"
                    )
                    processing = await conn.fetchval(
                        "SELECT COUNT(*) FROM submissions WHERE status = 'processing'"
                    )

            label = task_id or "all"
            QUEUE_DEPTH.labels(status="queued", task_id=label).set(queued)
            QUEUE_DEPTH.labels(status="processing", task_id=label).set(processing)
        except Exception as e:
            logger.warning("queue_metrics_error", error=str(e))

        await asyncio.sleep(10)


def start_metrics_server():
    start_http_server(settings.metrics_port)
    logger.info("metrics_server_started", port=settings.metrics_port)
