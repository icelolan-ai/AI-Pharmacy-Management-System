"""The single source of "today" for business rules (D9).

"Today" is the calendar date in STORE_TIMEZONE, computed by PostgreSQL:
    (now() AT TIME ZONE '<store timezone>')::date
Never use CURRENT_DATE (database session timezone, UTC on Supabase) or
Python's date.today() / datetime.now() for business decisions.
"""

from datetime import date

from psycopg import Cursor, sql

from app import db
from app.config import ConfigError, get_settings


def business_today_sql(at: sql.Composable | None = None) -> sql.Composed:
    """SQL expression for the store's calendar date.

    `at` lets callers evaluate a specific instant (default: now()).
    """
    moment = at if at is not None else sql.SQL("now()")
    return sql.SQL("(({moment}) AT TIME ZONE {tz})::date").format(
        moment=moment, tz=sql.Literal(get_settings().store_timezone)
    )


def store_day_start_sql() -> sql.Composed:
    """SQL (one %s placeholder = a calendar date) -> timestamptz at 00:00 of that
    date in the store timezone. Use for date_from/date_to filters on timestamptz."""
    return sql.SQL("((%s::date)::timestamp AT TIME ZONE {tz})").format(
        tz=sql.Literal(get_settings().store_timezone)
    )


def fetch_business_today(cur: Cursor) -> date:
    cur.execute(sql.SQL("SELECT {} AS today").format(business_today_sql()))
    return cur.fetchone()["today"]


def timezone_is_known(cur: Cursor, timezone_name: str) -> bool:
    cur.execute("SELECT 1 AS known FROM pg_timezone_names WHERE name = %s", (timezone_name,))
    return cur.fetchone() is not None


def ensure_store_timezone() -> None:
    """Raise ConfigError if STORE_TIMEZONE is not a PostgreSQL timezone name."""
    timezone_name = get_settings().store_timezone
    with db.get_transaction() as cur:
        if not timezone_is_known(cur, timezone_name):
            raise ConfigError(
                f"STORE_TIMEZONE '{timezone_name}' is not a timezone name known to PostgreSQL"
            )
