from fastapi import FastAPI
from fastapi.responses import JSONResponse

from shared import db
from shared.observability import logger
from shared.test_data import test_data_loader

health_app = FastAPI(title="Validator Health")


@health_app.get("/health")
async def health():
    try:
        async with db.pool.acquire(timeout=2) as conn:
            await conn.fetchval("SELECT 1")
    except Exception:
        logger.exception("health_database_check_failed")
        return JSONResponse(
            status_code=503,
            content={"status": "unhealthy"},
        )
    return {"status": "ok"}


@health_app.get("/ready")
async def ready():
    errors = []

    try:
        async with db.pool.acquire() as conn:
            await conn.fetchval("SELECT 1")
    except Exception:
        logger.exception("readiness_database_check_failed")
        errors.append("database")

    try:
        await test_data_loader.ping()
    except Exception:
        logger.exception("readiness_test_data_check_failed")
        errors.append("test_data")

    if errors:
        return JSONResponse(
            status_code=503,
            content={"status": "not_ready", "errors": errors},
        )

    return {"status": "ready"}

