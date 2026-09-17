"""Audit log reader (spec 9.8). owner only — enforced in the router."""

from datetime import date, timedelta
from typing import Any
from uuid import UUID

from psycopg import sql

from app import db
from app.business_date import store_day_start_sql
from app.errors import AppError


def list_audit_logs(
    *,
    table_name: str | None,
    record_id: UUID | None,
    changed_by: UUID | None,
    date_from: date | None,
    date_to: date | None,
    limit: int,
    offset: int,
) -> dict[str, Any]:
    """date_from / date_to are calendar dates in the store timezone (D9), inclusive."""
    if date_from and date_to and date_from > date_to:
        raise AppError(
            "VALIDATION_ERROR",
            "date_from ต้องไม่เกิน date_to",
            400,
            {"date_from": date_from.isoformat(), "date_to": date_to.isoformat()},
        )

    conditions: list[sql.Composable] = []
    params: list[Any] = []
    for clause, value in (
        (sql.SQL("a.table_name = %s"), table_name),
        (sql.SQL("a.record_id = %s"), record_id),
        (sql.SQL("a.changed_by = %s"), changed_by),
    ):
        if value is not None:
            conditions.append(clause)
            params.append(value)
    if date_from is not None:
        conditions.append(sql.SQL("a.created_at >= ") + store_day_start_sql())
        params.append(date_from)
    if date_to is not None:
        conditions.append(sql.SQL("a.created_at < ") + store_day_start_sql())
        params.append(date_to + timedelta(days=1))
    where = sql.SQL(" WHERE ") + sql.SQL(" AND ").join(conditions) if conditions else sql.SQL("")

    with db.get_transaction() as cur:
        cur.execute(sql.SQL("SELECT count(*) AS total FROM public.audit_logs a") + where, params)
        total = cur.fetchone()["total"]
        cur.execute(
            sql.SQL(
                """
                SELECT a.id, a.table_name, a.record_id, a.action, a.old_value, a.new_value,
                       a.changed_by, p.full_name AS changed_by_name, a.reason, a.created_at
                FROM public.audit_logs a
                LEFT JOIN public.user_profiles p ON p.id = a.changed_by
                """
            )
            + where
            + sql.SQL(" ORDER BY a.created_at DESC, a.id DESC LIMIT %s OFFSET %s"),
            [*params, limit, offset],
        )
        items = cur.fetchall()
    return {"items": items, "total": total, "limit": limit, "offset": offset}
