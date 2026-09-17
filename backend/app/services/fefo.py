"""FEFO (First Expired, First Out) — shared by sales and fefo-preview (spec 10.2, D9, D10).

Sellable lot: status 'active', quantity_remaining > 0, expiry_date > business today.
Order: expiry_date ASC, received_date ASC, id ASC.
"""

from dataclasses import dataclass, field
from datetime import date
from typing import Any
from uuid import UUID

from psycopg import sql

from app import db
from app.business_date import business_today_sql, fetch_business_today
from app.errors import AppError


@dataclass(frozen=True)
class Allocation:
    lot_id: UUID
    lot_number: str
    expiry_date: date
    quantity: int
    remaining_before: int


@dataclass
class FefoPlan:
    medicine_id: UUID
    requested: int
    available: int
    allocations: list[Allocation] = field(default_factory=list)

    @property
    def sufficient(self) -> bool:
        return self.available >= self.requested


def sellable_lots_sql(*, lock: bool) -> sql.Composed:
    query = sql.SQL(
        """
        SELECT id, medicine_id, lot_number, quantity_remaining, expiry_date,
               received_date, status
        FROM public.medicine_lots
        WHERE medicine_id = %s
          AND status = 'active'
          AND quantity_remaining > 0
          AND expiry_date > {today}
        ORDER BY expiry_date ASC, received_date ASC, id ASC
        """
    ).format(today=business_today_sql())
    return query + sql.SQL(" FOR UPDATE") if lock else query


def fetch_sellable_lots(cur, medicine_id: UUID, *, lock: bool) -> list[dict[str, Any]]:
    cur.execute(sellable_lots_sql(lock=lock), (medicine_id,))
    return cur.fetchall()


def allocate(
    medicine_id: UUID, lots: list[dict[str, Any]], requested: int, today: date
) -> FefoPlan:
    """Split `requested` across lots in FEFO order.

    Re-applies the sellable filter and ordering in Python (mirrors the SQL), so the
    rule holds even if a caller passes unfiltered rows.
    """
    sellable = sorted(
        (
            lot
            for lot in lots
            if lot["status"] == "active"
            and lot["quantity_remaining"] > 0
            and lot["expiry_date"] > today
        ),
        key=lambda lot: (lot["expiry_date"], lot["received_date"], lot["id"]),
    )
    plan = FefoPlan(
        medicine_id=medicine_id,
        requested=requested,
        available=sum(lot["quantity_remaining"] for lot in sellable),
    )
    still_needed = requested
    for lot in sellable:
        if still_needed <= 0:
            break
        take = min(lot["quantity_remaining"], still_needed)
        plan.allocations.append(
            Allocation(
                lot_id=lot["id"],
                lot_number=lot["lot_number"],
                expiry_date=lot["expiry_date"],
                quantity=take,
                remaining_before=lot["quantity_remaining"],
            )
        )
        still_needed -= take
    return plan


def plan_for_medicine(cur, medicine_id: UUID, requested: int, today: date, *, lock: bool) -> FefoPlan:
    lots = fetch_sellable_lots(cur, medicine_id, lock=lock)
    return allocate(medicine_id, lots, requested, today)


def _medicine_exists(cur, medicine_id: UUID) -> bool:
    cur.execute("SELECT 1 AS found FROM public.medicines WHERE id = %s", (medicine_id,))
    return cur.fetchone() is not None


def preview(medicine_id: UUID, quantity: int) -> dict[str, Any]:
    """Read-only: no locks, nothing written."""
    with db.get_transaction() as cur:
        if not _medicine_exists(cur, medicine_id):
            raise AppError("NOT_FOUND", "ไม่พบข้อมูลยา", 404)
        today = fetch_business_today(cur)
        plan = plan_for_medicine(cur, medicine_id, quantity, today, lock=False)
    return {
        "medicine_id": medicine_id,
        "requested": plan.requested,
        "available": plan.available,
        "sufficient": plan.sufficient,
        "allocations": [
            {
                "lot_id": a.lot_id,
                "lot_number": a.lot_number,
                "expiry_date": a.expiry_date,
                "quantity": a.quantity,
            }
            for a in plan.allocations
        ],
    }
