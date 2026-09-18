"""Sales with FEFO lot cutting — spec 9.6, 10.2, 10.5; D9, D10, D11.

The whole sale runs in one transaction: any error rolls back every row.
All SQL is parameterized.
"""

from datetime import date, timedelta
from decimal import Decimal
from typing import Any
from uuid import UUID

from psycopg import sql
from psycopg.errors import UniqueViolation

from app import db
from app.audit import write_audit
from app.auth import CurrentUser
from app.business_date import fetch_business_today, store_day_start_sql
from app.errors import AppError
from app.money import MAX_AMOUNT, money
from app.schemas.sale import SaleIn
from app.services import fefo


# D26: เลขที่บิล S-YYMMDD-NNN. The unique index is the real guard against two
# sales claiming the same number; on a clash the whole transaction is retried.
SALE_NO_UNIQUE_CONSTRAINT = "sales_sale_no_key"
MAX_SALE_NO_ATTEMPTS = 5
BE_OFFSET = 543


def sale_no_prefix(business_today: date) -> str:
    """S-690918 for 18 ก.ย. 2569 — Buddhist year, last two digits."""
    buddhist_year = business_today.year + BE_OFFSET
    return f"S-{buddhist_year % 100:02d}{business_today.month:02d}{business_today.day:02d}"


def next_sale_no(cur, business_today: date) -> str:
    """The next running number for this business day, read inside the sale's
    own transaction so it cannot be stale by the time the row is written."""
    prefix = sale_no_prefix(business_today)
    cur.execute(
        """
        SELECT COALESCE(MAX(split_part(sale_no, '-', 3)::bigint), 0) AS last_running
        FROM public.sales
        WHERE sale_no LIKE %s AND split_part(sale_no, '-', 3) ~ '^[0-9]+$'
        """,
        (f"{prefix}-%",),
    )
    running = cur.fetchone()["last_running"] + 1
    # At least three digits; past 999 it simply grows rather than wrapping.
    return f"{prefix}-{running:03d}"


def _validation_error(message: str, details: Any = None) -> AppError:
    return AppError("VALIDATION_ERROR", message, 400, details)


def _load_medicines(cur, medicine_ids: list[UUID]) -> dict[UUID, dict[str, Any]]:
    cur.execute(
        "SELECT id, name, selling_price, is_active FROM public.medicines WHERE id = ANY(%s)",
        (list(set(medicine_ids)),),
    )
    return {row["id"]: row for row in cur.fetchall()}


def resolve_lines(
    data: SaleIn, medicines: dict[UUID, dict[str, Any]], role: str
) -> list[dict[str, Any]]:
    """Validate items against medicines and D11; return one line per item with its price."""
    duplicates: list[dict[str, Any]] = []
    first_index: dict[UUID, int] = {}
    for index, item in enumerate(data.items):
        if item.medicine_id in first_index:
            duplicates.append(
                {"index": index, "duplicate_of": first_index[item.medicine_id], "medicine_id": str(item.medicine_id)}
            )
        else:
            first_index[item.medicine_id] = index
    if duplicates:
        raise _validation_error("มียาซ้ำในบิลเดียวกัน กรุณารวมจำนวนเป็นรายการเดียว", duplicates)

    unusable = [
        {"index": index, "medicine_id": str(item.medicine_id)}
        for index, item in enumerate(data.items)
        if not (medicines.get(item.medicine_id) or {}).get("is_active")
    ]
    if unusable:
        raise _validation_error("ไม่พบยาหรือยาถูกปิดการใช้งาน", unusable)

    lines = []
    price_changed: list[dict[str, Any]] = []
    no_price: list[dict[str, Any]] = []
    for index, item in enumerate(data.items):
        selling_price = medicines[item.medicine_id]["selling_price"]
        if item.unit_price is None:
            if selling_price is None:
                no_price.append({"index": index, "medicine_id": str(item.medicine_id)})
                continue
            unit_price = money(selling_price)
        else:
            unit_price = money(item.unit_price)
            if selling_price is None or unit_price != money(selling_price):
                price_changed.append({"index": index, "medicine_id": str(item.medicine_id)})
        lines.append(
            {
                "index": index,
                "medicine_id": item.medicine_id,
                "medicine_name": medicines[item.medicine_id]["name"],
                "quantity": item.quantity,
                "unit_price": unit_price,
                "selling_price": selling_price,
                "price_override": selling_price is None or unit_price != money(selling_price),
            }
        )

    # D11: staff must sell at selling_price.
    if role == "staff" and price_changed:
        raise AppError("FORBIDDEN", "คุณไม่มีสิทธิ์เปลี่ยนราคาขาย", 403, price_changed)
    if no_price:
        raise _validation_error("ยังไม่ได้ตั้งราคาขาย", no_price)
    return lines


def compute_total(lines: list[dict[str, Any]], discount_amount: Decimal) -> tuple[Decimal, Decimal]:
    """Return (items_subtotal, total). Per-lot subtotals equal qty x price exactly, so the
    total can be checked before any lot is locked."""
    items_subtotal = money(
        sum((money(Decimal(line["quantity"]) * line["unit_price"]) for line in lines), Decimal("0"))
    )
    total = money(items_subtotal - money(discount_amount))
    if total < 0:
        raise _validation_error(
            "ยอดรวมสุทธิติดลบ (ส่วนลดมากกว่ายอดขาย)",
            {"items_subtotal": str(items_subtotal), "total_amount": str(total)},
        )
    if items_subtotal > MAX_AMOUNT:
        raise _validation_error("จำนวนเงินเกินขีดจำกัดของระบบ", {"max_amount": str(MAX_AMOUNT)})
    return items_subtotal, total


def _fetch_sale(cur, sale_id: UUID) -> dict[str, Any] | None:
    cur.execute(
        """
        SELECT s.id, s.sale_no, s.sale_date, s.discount_amount, s.tax_amount, s.total_amount,
               p.full_name AS sold_by_name
        FROM public.sales s
        LEFT JOIN public.user_profiles p ON p.id = s.created_by
        WHERE s.id = %s
        """,
        (sale_id,),
    )
    sale = cur.fetchone()
    if sale is None:
        return None
    cur.execute(
        """
        SELECT si.medicine_id, m.name AS medicine_name, si.medicine_lot_id AS lot_id,
               l.lot_number, l.expiry_date, si.quantity, si.unit_price, si.subtotal
        FROM public.sale_items si
        JOIN public.medicine_lots l ON l.id = si.medicine_lot_id
        LEFT JOIN public.medicines m ON m.id = si.medicine_id
        WHERE si.sale_id = %s
        ORDER BY m.name, l.expiry_date, l.received_date, l.id
        """,
        (sale_id,),
    )
    return {**sale, "items": cur.fetchall()}


def _create_sale_once(data: SaleIn, user: CurrentUser) -> dict[str, Any]:
    # D11: staff cannot give discounts.
    if user.role == "staff" and data.discount_amount > 0:
        raise AppError("FORBIDDEN", "คุณไม่มีสิทธิ์ให้ส่วนลด", 403)

    with db.get_transaction() as cur:
        today: date = fetch_business_today(cur)
        medicines = _load_medicines(cur, [item.medicine_id for item in data.items])
        lines = resolve_lines(data, medicines, user.role)
        _, total = compute_total(lines, data.discount_amount)

        # Lock lots medicine by medicine in a fixed order to avoid deadlocks.
        plans = []
        shortages = []
        for line in sorted(lines, key=lambda line: line["medicine_id"]):
            plan = fefo.plan_for_medicine(cur, line["medicine_id"], line["quantity"], today, lock=True)
            if not plan.sufficient:
                shortages.append(
                    {"medicine_id": str(line["medicine_id"]), "requested": plan.requested, "available": plan.available}
                )
            plans.append((line, plan))
        if shortages:
            raise AppError("INSUFFICIENT_STOCK", "จำนวนยาในสต็อกไม่เพียงพอ", 409, shortages)

        cur.execute(
            """
            INSERT INTO public.sales
                (sale_no, sale_date, discount_amount, tax_amount, total_amount, created_by)
            VALUES (%s, now(), %s, 0, %s, %s)
            RETURNING *
            """,
            (next_sale_no(cur, today), money(data.discount_amount), total, user.id),
        )
        sale = cur.fetchone()

        audit_items = []
        for line, plan in plans:
            for allocation in plan.allocations:
                subtotal = money(Decimal(allocation.quantity) * line["unit_price"])
                cur.execute(
                    """
                    INSERT INTO public.sale_items
                        (sale_id, medicine_id, medicine_lot_id, quantity, unit_price, subtotal)
                    VALUES (%s, %s, %s, %s, %s, %s)
                    RETURNING *
                    """,
                    (sale["id"], line["medicine_id"], allocation.lot_id, allocation.quantity, line["unit_price"], subtotal),
                )
                sale_item = cur.fetchone()

                after = allocation.remaining_before - allocation.quantity
                cur.execute(
                    """
                    UPDATE public.medicine_lots
                    SET quantity_remaining = quantity_remaining - %s,
                        status = CASE WHEN quantity_remaining - %s = 0 THEN 'depleted' ELSE status END
                    WHERE id = %s AND quantity_remaining = %s
                    RETURNING quantity_remaining, status
                    """,
                    (allocation.quantity, allocation.quantity, allocation.lot_id, allocation.remaining_before),
                )
                updated_lot = cur.fetchone()
                if updated_lot is None or updated_lot["quantity_remaining"] != after:
                    # Row is locked FOR UPDATE, so this should never happen; abort to be safe.
                    raise RuntimeError("Lot quantity changed during sale")

                cur.execute(
                    """
                    INSERT INTO public.inventory_transactions
                        (medicine_lot_id, transaction_type, quantity_change, quantity_before,
                         quantity_after, reference_type, reference_id, created_by)
                    VALUES (%s, 'sale', %s, %s, %s, 'sale', %s, %s)
                    """,
                    (allocation.lot_id, -allocation.quantity, allocation.remaining_before, after, sale["id"], user.id),
                )
                audit_items.append(
                    {
                        "sale_item_id": sale_item["id"],
                        "medicine_id": line["medicine_id"],
                        "lot_id": allocation.lot_id,
                        "lot_number": allocation.lot_number,
                        "quantity": allocation.quantity,
                        "quantity_before": allocation.remaining_before,
                        "quantity_after": after,
                        "lot_status_after": updated_lot["status"],
                        "unit_price": line["unit_price"],
                        "selling_price": line["selling_price"],
                        "price_override": line["price_override"],
                        "subtotal": subtotal,
                    }
                )

        write_audit(
            cur,
            "sales",
            sale["id"],
            "insert",
            None,
            {
                "sale": sale,
                "discount_amount": money(data.discount_amount),
                "items": audit_items,
                "price_override": any(line["price_override"] for line in lines),
            },
            user.id,
        )
        return _fetch_sale(cur, sale["id"])


def _is_sale_no_clash(exc: UniqueViolation) -> bool:
    return getattr(exc.diag, "constraint_name", None) == SALE_NO_UNIQUE_CONSTRAINT


def create_sale(data: SaleIn, user: CurrentUser) -> dict[str, Any]:
    """Two tills can read the same running number at the same instant; the unique
    index catches it and the whole sale is replayed on a clean transaction."""
    for attempt in range(1, MAX_SALE_NO_ATTEMPTS + 1):
        try:
            return _create_sale_once(data, user)
        except UniqueViolation as exc:
            if not _is_sale_no_clash(exc):
                raise
            if attempt == MAX_SALE_NO_ATTEMPTS:
                # Never save a sale without a number: say so instead.
                raise AppError(
                    "INVALID_STATE",
                    "ออกเลขที่บิลไม่สำเร็จ กรุณาลองใหม่อีกครั้ง",
                    409,
                    {"attempts": attempt},
                ) from None
    raise RuntimeError("unreachable")


def get_sale(sale_id: UUID) -> dict[str, Any]:
    with db.get_transaction() as cur:
        sale = _fetch_sale(cur, sale_id)
    if sale is None:
        raise AppError("NOT_FOUND", "ไม่พบข้อมูลการขาย", 404)
    return sale


def list_sales(*, date_from: date | None, date_to: date | None, limit: int, offset: int) -> dict[str, Any]:
    """date_from / date_to are calendar dates in the store timezone (D9), inclusive."""
    if date_from and date_to and date_from > date_to:
        raise _validation_error(
            "date_from ต้องไม่เกิน date_to",
            {"date_from": date_from.isoformat(), "date_to": date_to.isoformat()},
        )

    conditions: list[sql.Composable] = []
    params: list[Any] = []
    if date_from is not None:
        conditions.append(sql.SQL("s.sale_date >= ") + store_day_start_sql())
        params.append(date_from)
    if date_to is not None:
        # Exclusive upper bound: 00:00 of the next store-local day.
        conditions.append(sql.SQL("s.sale_date < ") + store_day_start_sql())
        params.append(date_to + timedelta(days=1))
    where = sql.SQL(" WHERE ") + sql.SQL(" AND ").join(conditions) if conditions else sql.SQL("")

    with db.get_transaction() as cur:
        cur.execute(sql.SQL("SELECT count(*) AS total FROM public.sales s") + where, params)
        total = cur.fetchone()["total"]
        cur.execute(
            sql.SQL(
                "SELECT s.id, s.sale_no, s.sale_date, s.discount_amount, s.tax_amount, s.total_amount "
                "FROM public.sales s"
            )
            + where
            + sql.SQL(" ORDER BY s.sale_date DESC, s.id DESC LIMIT %s OFFSET %s"),
            [*params, limit, offset],
        )
        items = cur.fetchall()
    return {"items": items, "total": total, "limit": limit, "offset": offset}
