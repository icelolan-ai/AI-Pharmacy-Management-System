"""Basic SQL reports — spec 9.7, 10.4; D9, D10.

Every report uses business today (store timezone) and excludes medicines with
is_active = false. All SQL is parameterized.
"""

from decimal import Decimal
from typing import Any

from psycopg import sql

from app import db
from app.business_date import business_today_sql
from app.schemas.common import escape_like

UNCATEGORIZED = "ไม่ระบุหมวดหมู่"

# (max days_remaining inclusive, level) — spec 9.7 / 02-database-schema 4.2
RISK_THRESHOLDS = ((30, "critical"), (90, "high_risk"), (180, "warning"))
RISK_LEVELS = (*(level for _, level in RISK_THRESHOLDS), "normal")


def risk_level(days_remaining: int) -> str:
    for max_days, level in RISK_THRESHOLDS:
        if days_remaining <= max_days:
            return level
    return "normal"


def risk_case_sql(column: str) -> sql.Composed:
    """SQL CASE equivalent of risk_level(), built from the same thresholds."""
    whens = sql.SQL(" ").join(
        sql.SQL("WHEN {col} <= {days} THEN {level}").format(
            col=sql.Identifier(column), days=sql.Literal(max_days), level=sql.Literal(level)
        )
        for max_days, level in RISK_THRESHOLDS
    )
    return sql.SQL("CASE {whens} ELSE 'normal' END").format(whens=whens)


def category_label(category: str | None) -> str:
    return category if category else UNCATEGORIZED


def _page(items, total, limit, offset) -> dict[str, Any]:
    return {"items": items, "total": total, "limit": limit, "offset": offset}


def stock_report(*, q: str | None, category: str | None, limit: int, offset: int) -> dict[str, Any]:
    conditions: list[sql.Composable] = [sql.SQL("m.is_active = true")]
    params: list[Any] = []
    if category:
        conditions.append(sql.SQL("m.category = %s"))
        params.append(category)
    search = (q or "").strip()
    if search:
        pattern = f"%{escape_like(search)}%"
        conditions.append(
            sql.SQL(
                "(m.name ILIKE %s ESCAPE '\\' OR m.generic_name ILIKE %s ESCAPE '\\'"
                " OR m.barcode = %s)"
            )
        )
        params.extend([pattern, pattern, search])
    where = sql.SQL(" WHERE ") + sql.SQL(" AND ").join(conditions)

    rows_sql = (
        sql.SQL(
            """
            SELECT m.id AS medicine_id, m.name, m.strength, m.category, m.reorder_point,
                   COALESCE(SUM(l.quantity_remaining) FILTER (WHERE l.expiry_date > {today}), 0)
                       AS available_quantity,
                   COALESCE(SUM(l.quantity_remaining) FILTER (WHERE l.expiry_date <= {today}), 0)
                       AS expired_quantity,
                   COALESCE(SUM(l.quantity_remaining * l.cost_per_unit)
                            FILTER (WHERE l.expiry_date > {today}), 0) AS available_value,
                   COALESCE(SUM(l.quantity_remaining * l.cost_per_unit)
                            FILTER (WHERE l.expiry_date <= {today}), 0) AS expired_value
            FROM public.medicines m
            LEFT JOIN public.medicine_lots l
                   ON l.medicine_id = m.id AND l.status = 'active' AND l.quantity_remaining > 0
            """
        ).format(today=business_today_sql())
        + where
        + sql.SQL(
            " GROUP BY m.id, m.name, m.strength, m.category, m.reorder_point"
            " ORDER BY m.name, m.id LIMIT %s OFFSET %s"
        )
    )

    with db.get_transaction() as cur:
        cur.execute(sql.SQL("SELECT count(*) AS total FROM public.medicines m") + where, params)
        total = cur.fetchone()["total"]
        cur.execute(rows_sql, [*params, limit, offset])
        items = cur.fetchall()
    return _page(items, total, limit, offset)


def _expiring_cte() -> sql.Composed:
    return sql.SQL(
        """
        WITH expiring AS (
            SELECT l.id AS lot_id, l.medicine_id, m.name AS medicine_name, l.lot_number,
                   l.quantity_remaining, l.expiry_date, l.received_date,
                   (l.expiry_date - {today}) AS days_remaining,
                   (l.quantity_remaining * l.cost_per_unit) AS stock_value
            FROM public.medicine_lots l
            JOIN public.medicines m ON m.id = l.medicine_id
            WHERE m.is_active = true
              AND l.status = 'active'
              AND l.quantity_remaining > 0
              AND l.expiry_date > {today}
              AND l.expiry_date <= {today} + %s
        )
        """
    ).format(today=business_today_sql())


def expiring_report(*, days: int, limit: int, offset: int) -> dict[str, Any]:
    """Sellable lots expiring within `days` (D10: a lot expiring today is in /expired)."""
    with db.get_transaction() as cur:
        cur.execute(
            _expiring_cte()
            + sql.SQL(
                "SELECT {risk} AS risk_level, count(*) AS lot_count,"
                " COALESCE(SUM(stock_value), 0) AS stock_value FROM expiring GROUP BY 1"
            ).format(risk=risk_case_sql("days_remaining")),
            (days,),
        )
        grouped = {row["risk_level"]: row for row in cur.fetchall()}
        cur.execute(
            _expiring_cte()
            + sql.SQL(
                "SELECT * FROM expiring ORDER BY expiry_date ASC, received_date ASC, lot_id ASC"
                " LIMIT %s OFFSET %s"
            ),
            (days, limit, offset),
        )
        rows = cur.fetchall()

    summary = {
        level: {
            "lot_count": grouped.get(level, {}).get("lot_count", 0),
            "stock_value": grouped.get(level, {}).get("stock_value", Decimal("0")),
        }
        for level in RISK_LEVELS
    }
    items = [{**row, "risk_level": risk_level(row["days_remaining"])} for row in rows]
    total = sum(entry["lot_count"] for entry in summary.values())
    return {**_page(items, total, limit, offset), "summary": summary}


def expired_report(*, limit: int, offset: int) -> dict[str, Any]:
    """Active lots with stock whose expiry_date <= today: remove via 'expired' adjustments."""
    base = sql.SQL(
        """
        FROM public.medicine_lots l
        JOIN public.medicines m ON m.id = l.medicine_id
        WHERE m.is_active = true
          AND l.status = 'active'
          AND l.quantity_remaining > 0
          AND l.expiry_date <= {today}
        """
    ).format(today=business_today_sql())

    with db.get_transaction() as cur:
        cur.execute(sql.SQL("SELECT count(*) AS total ") + base)
        total = cur.fetchone()["total"]
        cur.execute(
            sql.SQL(
                """
                SELECT l.id AS lot_id, l.medicine_id, m.name AS medicine_name, l.lot_number,
                       l.quantity_remaining, l.expiry_date,
                       ({today} - l.expiry_date) AS days_expired,
                       (l.quantity_remaining * l.cost_per_unit) AS stock_value
                """
            ).format(today=business_today_sql())
            + base
            + sql.SQL(" ORDER BY l.expiry_date ASC, l.id ASC LIMIT %s OFFSET %s"),
            (limit, offset),
        )
        items = cur.fetchall()
    return _page(items, total, limit, offset)


def _low_stock_cte() -> sql.Composed:
    return sql.SQL(
        """
        WITH stock AS (
            SELECT m.id AS medicine_id, m.name, m.reorder_point,
                   COALESCE(SUM(l.quantity_remaining) FILTER (
                       WHERE l.status = 'active' AND l.quantity_remaining > 0
                         AND l.expiry_date > {today}), 0) AS available_quantity
            FROM public.medicines m
            LEFT JOIN public.medicine_lots l ON l.medicine_id = m.id
            WHERE m.is_active = true AND m.reorder_point IS NOT NULL
            GROUP BY m.id, m.name, m.reorder_point
        )
        """
    ).format(today=business_today_sql())


def low_stock_report(*, limit: int, offset: int) -> dict[str, Any]:
    with db.get_transaction() as cur:
        cur.execute(
            _low_stock_cte()
            + sql.SQL("SELECT count(*) AS total FROM stock WHERE available_quantity <= reorder_point")
        )
        total = cur.fetchone()["total"]
        cur.execute(
            _low_stock_cte()
            + sql.SQL(
                "SELECT medicine_id, name, available_quantity, reorder_point,"
                " (reorder_point - available_quantity) AS shortage"
                " FROM stock WHERE available_quantity <= reorder_point"
                " ORDER BY shortage DESC, name ASC, medicine_id ASC LIMIT %s OFFSET %s"
            ),
            (limit, offset),
        )
        items = cur.fetchall()
    return _page(items, total, limit, offset)


def _value_columns() -> sql.Composed:
    return sql.SQL(
        """
        COALESCE(SUM(l.quantity_remaining * l.cost_per_unit), 0) AS total_value,
        COALESCE(SUM(l.quantity_remaining * l.cost_per_unit)
                 FILTER (WHERE l.expiry_date > {today}), 0) AS sellable_value,
        COALESCE(SUM(l.quantity_remaining * l.cost_per_unit)
                 FILTER (WHERE l.expiry_date <= {today}), 0) AS expired_value
        """
    ).format(today=business_today_sql())


_VALUE_FROM = sql.SQL(
    """
    FROM public.medicine_lots l
    JOIN public.medicines m ON m.id = l.medicine_id
    WHERE m.is_active = true AND l.status = 'active' AND l.quantity_remaining > 0
    """
)


def inventory_value_report(*, limit: int, offset: int) -> dict[str, Any]:
    with db.get_transaction() as cur:
        cur.execute(sql.SQL("SELECT ") + _value_columns() + _VALUE_FROM)
        totals = cur.fetchone()

        cur.execute(sql.SQL("SELECT count(DISTINCT m.id) AS total ") + _VALUE_FROM)
        medicine_total = cur.fetchone()["total"]
        cur.execute(
            sql.SQL("SELECT m.id AS medicine_id, m.name, ")
            + _value_columns()
            + _VALUE_FROM
            + sql.SQL(" GROUP BY m.id, m.name ORDER BY total_value DESC, m.name, m.id LIMIT %s OFFSET %s"),
            (limit, offset),
        )
        by_medicine = cur.fetchall()

        cur.execute(
            sql.SQL("SELECT m.category, ")
            + _value_columns()
            + _VALUE_FROM
            + sql.SQL(" GROUP BY m.category ORDER BY total_value DESC, m.category NULLS LAST")
        )
        by_category = [{**row, "category": category_label(row["category"])} for row in cur.fetchall()]

    return {
        **totals,
        "by_medicine": _page(by_medicine, medicine_total, limit, offset),
        "by_category": by_category,
    }
