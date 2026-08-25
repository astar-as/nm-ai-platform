import json
from contextlib import asynccontextmanager
from typing import AsyncGenerator

import asyncpg

from app.config import settings

pool: asyncpg.Pool | None = None


async def _init_connection(conn):
    await conn.set_type_codec(
        "jsonb",
        encoder=json.dumps,
        decoder=json.loads,
        schema="pg_catalog",
    )


async def init_pool():
    global pool
    pool = await asyncpg.create_pool(
        settings.database_url,
        min_size=1,
        max_size=5,
        init=_init_connection,
    )


async def close_pool():
    global pool
    if pool:
        await pool.close()


@asynccontextmanager
async def get_connection() -> AsyncGenerator[asyncpg.Connection, None]:
    async with pool.acquire() as conn:
        yield conn
