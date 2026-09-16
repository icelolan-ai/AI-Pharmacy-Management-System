"""PostgreSQL connection pool (sync psycopg_pool) and transaction helper."""

import logging
from collections.abc import Iterator
from contextlib import contextmanager

from psycopg import Cursor, sql
from psycopg.rows import dict_row
from psycopg_pool import ConnectionPool

from app.config import Settings

logger = logging.getLogger(__name__)

_pool: ConnectionPool | None = None


def open_pool(settings: Settings) -> None:
    """Open the pool without blocking on the database.

    The pool connects in the background and keeps retrying, so the app still
    starts when the database is unreachable (/health then reports 503).
    """
    global _pool
    if _pool is not None:
        return
    _pool = ConnectionPool(
        conninfo=settings.database_url.get_secret_value(),
        min_size=1,
        max_size=5,
        kwargs={"connect_timeout": 10},
        check=ConnectionPool.check_connection,
        name="pharmacy-db",
        open=False,
    )
    # Do not use open(wait=True): on timeout psycopg_pool closes the pool.
    _pool.open(wait=False)
    logger.info("Database pool opened (min_size=1, max_size=5)")


def close_pool() -> None:
    global _pool
    if _pool is None:
        return
    _pool.close()
    _pool = None
    logger.info("Database pool closed")


def get_pool() -> ConnectionPool:
    if _pool is None:
        raise RuntimeError("Database pool is not open")
    return _pool


@contextmanager
def get_transaction() -> Iterator[Cursor]:
    """Yield a dict-row cursor inside one transaction.

    Commits when the block succeeds, rolls back when it raises.
    """
    with get_pool().connection() as conn:
        with conn.transaction():
            with conn.cursor(row_factory=dict_row) as cur:
                yield cur


def check_database(timeout: float = 3.0) -> bool:
    """Return True if SELECT 1 succeeds within the timeout. Never raises."""
    if _pool is None:
        return False
    try:
        with _pool.connection(timeout=timeout) as conn:
            # SET cannot take a bound parameter; pass the integer as a literal.
            conn.execute(
                sql.SQL("SET LOCAL statement_timeout = {}").format(
                    sql.Literal(int(timeout * 1000))
                )
            )
            conn.execute("SELECT 1").fetchone()
        return True
    except Exception as exc:
        logger.warning("Database check failed: %s", type(exc).__name__)
        return False
