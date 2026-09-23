"""Daily sales totals for the dashboard line (U-7).

Every date in the window is returned, including days with no sales. Leaving
the empty days out would let the drawing join the day before a closure
straight to the day after it, which reads as trade that never happened.

D9 throughout: a sale belongs to the calendar day it fell on in the store's
timezone, never CURRENT_DATE, which on Supabase is UTC and would file the
evening's takings under tomorrow.
"""

from datetime import date, timedelta
from decimal import Decimal
from typing import Any

from psycopg import sql

from app import db
from app.business_date import business_today_sql, fetch_business_today
from app.errors import AppError
from app.money import money

MAX_DAYS = 365


def _validation_error(message: str, details: Any = None) -> AppError:
    return AppError("VALIDATION_ERROR", message, 400, details)


def sales_timeseries(*, days: int) -> dict[str, Any]:
    if days < 1 or days > MAX_DAYS:
        raise _validation_error(
            "ช่วงวันต้องอยู่ระหว่าง 1 ถึง 365 วัน",
            {"days": days, "max_days": MAX_DAYS},
        )

    with db.get_transaction() as cur:
        today = fetch_business_today(cur)
        first_day = today - timedelta(days=days - 1)

        # Group on the sale's own business date, worked out the same way "today"
        # is, so a sale at 23:30 Bangkok counts for that evening and not the
        # next morning in UTC.
        cur.execute(
            sql.SQL(
                """
                SELECT {sale_day} AS day,
                       count(*) AS sale_count,
                       coalesce(sum(s.total_amount), 0) AS total_amount
                FROM public.sales s
                WHERE {sale_day} BETWEEN %s AND %s
                GROUP BY 1
                """
            ).format(sale_day=business_today_sql(sql.SQL("s.sale_date"))),
            (first_day, today),
        )
        found = {
            row["day"]: (row["sale_count"], money(Decimal(row["total_amount"])))
            for row in cur.fetchall()
        }

    series: list[dict[str, Any]] = []
    for offset in range(days):
        day = first_day + timedelta(days=offset)
        sale_count, total = found.get(day, (0, Decimal("0.00")))
        series.append({"date": day, "sale_count": sale_count, "total_amount": total})

    busiest = max(
        (entry for entry in series if entry["total_amount"] > 0),
        key=lambda entry: (entry["total_amount"], entry["date"]),
        default=None,
    )

    return {
        "date_from": first_day,
        "date_to": today,
        "days": series,
        "total_amount": money(sum((entry["total_amount"] for entry in series), Decimal("0"))),
        "busiest_day": busiest["date"] if busiest else None,
    }
