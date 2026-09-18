"""Lot views, lot transaction history and stock adjustments — spec 9.4, 10.3, 10.4; D9.

All SQL is parameterized. Adjustments run in one transaction with their audit row.
"""

from typing import Any
from uuid import UUID

from psycopg import sql

from app import db
from app.audit import write_audit
from app.auth import CurrentUser
from app.business_date import business_today_sql, fetch_business_today
from app.errors import AppError
from app.schemas.lot import AdjustmentIn


def _lot_not_found() -> AppError:
    return AppError("NOT_FOUND", "ไม่พบข้อมูล Lot", 404)


def lot_select_sql() -> sql.Composed:
    """Lot columns + days_remaining and sellable, both relative to business today (D9, D10)."""
    return sql.SQL(
        """
        SELECT l.id, l.medicine_id, m.name AS medicine_name, l.lot_number, l.supplier_id,
               l.quantity_received, l.quantity_remaining, l.expiry_date, l.received_date,
               l.status, l.cost_per_unit,
               (l.expiry_date - {today}) AS days_remaining,
               (l.status = 'active' AND l.quantity_remaining > 0
                AND l.expiry_date > {today}) AS sellable
        FROM public.medicine_lots l
        JOIN public.medicines m ON m.id = l.medicine_id
        """
    ).format(today=business_today_sql())


def _fetch_lot(cur, lot_id: UUID) -> dict[str, Any] | None:
    cur.execute(lot_select_sql() + sql.SQL(" WHERE l.id = %s"), (lot_id,))
    return cur.fetchone()


def _lot_exists(cur, lot_id: UUID) -> bool:
    cur.execute("SELECT 1 AS found FROM public.medicine_lots WHERE id = %s", (lot_id,))
    return cur.fetchone() is not None


def list_medicine_lots(
    medicine_id: UUID, *, include_inactive: bool, limit: int, offset: int
) -> dict[str, Any]:
    conditions: list[sql.Composable] = [sql.SQL("l.medicine_id = %s")]
    if not include_inactive:
        conditions.append(sql.SQL("l.status = 'active' AND l.quantity_remaining > 0"))
    where = sql.SQL(" WHERE ") + sql.SQL(" AND ").join(conditions)

    with db.get_transaction() as cur:
        cur.execute("SELECT 1 AS found FROM public.medicines WHERE id = %s", (medicine_id,))
        if cur.fetchone() is None:
            raise AppError("NOT_FOUND", "ไม่พบข้อมูลยา", 404)
        cur.execute(
            sql.SQL("SELECT count(*) AS total FROM public.medicine_lots l") + where, (medicine_id,)
        )
        total = cur.fetchone()["total"]
        cur.execute(
            lot_select_sql()
            + where
            + sql.SQL(" ORDER BY l.expiry_date ASC, l.received_date ASC, l.id ASC LIMIT %s OFFSET %s"),
            (medicine_id, limit, offset),
        )
        items = cur.fetchall()
    return {"items": items, "total": total, "limit": limit, "offset": offset}


def get_lot(lot_id: UUID) -> dict[str, Any]:
    with db.get_transaction() as cur:
        lot = _fetch_lot(cur, lot_id)
    if lot is None:
        raise _lot_not_found()
    return lot


def list_lot_transactions(lot_id: UUID, *, limit: int, offset: int) -> dict[str, Any]:
    with db.get_transaction() as cur:
        if not _lot_exists(cur, lot_id):
            raise _lot_not_found()
        cur.execute(
            "SELECT count(*) AS total FROM public.inventory_transactions WHERE medicine_lot_id = %s",
            (lot_id,),
        )
        total = cur.fetchone()["total"]
        cur.execute(
            """
            SELECT id, medicine_lot_id, transaction_type, quantity_change, quantity_before,
                   quantity_after, reference_type, reference_id, notes, created_by, created_at
            FROM public.inventory_transactions
            WHERE medicine_lot_id = %s
            ORDER BY created_at DESC, id DESC
            LIMIT %s OFFSET %s
            """,
            (lot_id, limit, offset),
        )
        items = cur.fetchall()
    return {"items": items, "total": total, "limit": limit, "offset": offset}


def next_status(current_status: str, transaction_type: str, before: int, after: int) -> str:
    """Status after an adjustment (spec 10.3). Assumes validity checks already passed."""
    if after == 0:
        return {"damage": "damaged", "expired": "expired"}.get(transaction_type, "depleted")
    if after > before and current_status == "depleted":
        return "active"
    return current_status


def adjust_lot(lot_id: UUID, data: AdjustmentIn, user: CurrentUser) -> dict[str, Any]:
    with db.get_transaction() as cur:
        today = fetch_business_today(cur)
        cur.execute("SELECT * FROM public.medicine_lots WHERE id = %s FOR UPDATE", (lot_id,))
        lot = cur.fetchone()
        if lot is None:
            raise _lot_not_found()

        before = lot["quantity_remaining"]

        # D23: the client adjusts by a difference, so a sale in another window
        # would silently shift the result. Checked inside this transaction,
        # after the row lock, so the value cannot change underneath us.
        if data.quantity_before is not None and data.quantity_before != before:
            raise AppError(
                "INVALID_STATE",
                "จำนวนคงเหลือเปลี่ยนไป กรุณาตรวจนับใหม่",
                409,
                {"quantity_before": data.quantity_before, "quantity_remaining": before},
            )

        change = data.quantity_change
        after = before + change

        if after < 0:
            raise AppError(
                "VALIDATION_ERROR",
                "จำนวนคงเหลือไม่พอสำหรับการปรับ",
                400,
                {"remaining": before, "change": change},
            )
        if change > 0:
            if lot["expiry_date"] <= today:
                raise AppError(
                    "VALIDATION_ERROR",
                    "ไม่สามารถเพิ่มจำนวนให้ Lot ที่หมดอายุแล้ว",
                    400,
                    {"expiry_date": lot["expiry_date"].isoformat(), "today": today.isoformat()},
                )
            if lot["status"] in ("damaged", "expired"):
                raise AppError(
                    "INVALID_STATE",
                    "ไม่สามารถเพิ่มจำนวนให้ Lot ที่ถูกตัดออกจาก Stock แล้ว",
                    409,
                    {"status": lot["status"]},
                )

        status = next_status(lot["status"], data.transaction_type, before, after)
        cur.execute(
            "UPDATE public.medicine_lots SET quantity_remaining = %s, status = %s WHERE id = %s",
            (after, status, lot_id),
        )
        cur.execute(
            """
            INSERT INTO public.inventory_transactions
                (medicine_lot_id, transaction_type, quantity_change, quantity_before,
                 quantity_after, reference_type, reference_id, notes, created_by)
            VALUES (%s, %s, %s, %s, %s, 'adjustment', %s, %s, %s)
            RETURNING id
            """,
            (lot_id, data.transaction_type, change, before, after, lot_id, data.reason, user.id),
        )
        transaction_id = cur.fetchone()["id"]
        write_audit(
            cur,
            "medicine_lots",
            lot_id,
            "update",
            {"quantity_remaining": before, "status": lot["status"]},
            {"quantity_remaining": after, "status": status},
            user.id,
            reason=data.reason,
        )
        result = _fetch_lot(cur, lot_id)

    return {**result, "transaction_id": transaction_id}
