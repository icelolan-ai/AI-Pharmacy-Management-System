"""Purchases (goods receiving) — spec 9.5, 10.1, 10.5; business date D9, D10.

Every write runs in one transaction together with its audit row.
All SQL is parameterized.
"""

from datetime import date
from decimal import Decimal
from typing import Any
from uuid import UUID

from psycopg import sql
from psycopg.errors import UniqueViolation

from app import db
from app.audit import write_audit
from app.business_date import fetch_business_today
from app.errors import AppError
from app.money import MAX_AMOUNT, money
from app.schemas.purchase import PurchaseIn

MSG_EXPIRED = "ยาหมดอายุหรือหมดอายุวันนี้ ไม่สามารถรับเข้าได้"


# --- errors ----------------------------------------------------------------------------


def _validation_error(message: str, details: Any = None) -> AppError:
    return AppError("VALIDATION_ERROR", message, 400, details)


def _purchase_not_found() -> AppError:
    return AppError("NOT_FOUND", "ไม่พบข้อมูลใบรับสินค้า", 404)


def _invalid_state(status: str) -> AppError:
    return AppError(
        "INVALID_STATE",
        "ใบรับสินค้านี้ไม่ได้อยู่ในสถานะร่าง ไม่สามารถดำเนินการได้",
        409,
        {"status": status},
    )


# --- pure calculations ------------------------------------------------------------------


def compute_totals(
    items: list[dict[str, Any]], discount_amount: Decimal, tax_amount: Decimal
) -> tuple[list[Decimal], Decimal, Decimal]:
    """Return (subtotals, items_subtotal, total_amount), all rounded ROUND_HALF_UP.

    subtotal = quantity_invoiced x unit_cost
    total    = sum(subtotals) - discount + tax
    """
    subtotals = [money(Decimal(item["quantity_invoiced"]) * item["unit_cost"]) for item in items]
    items_subtotal = money(sum(subtotals, Decimal("0")))
    total = money(items_subtotal - money(discount_amount) + money(tax_amount))
    return subtotals, items_subtotal, total


def check_totals(subtotals: list[Decimal], items_subtotal: Decimal, total: Decimal) -> None:
    if total < 0:
        raise _validation_error(
            "ยอดรวมสุทธิติดลบ (ส่วนลดมากกว่ายอดสินค้า)",
            {"items_subtotal": str(items_subtotal), "total_amount": str(total)},
        )
    too_large = [i for i, s in enumerate(subtotals) if s > MAX_AMOUNT]
    if too_large or items_subtotal > MAX_AMOUNT or total > MAX_AMOUNT:
        raise _validation_error(
            "จำนวนเงินเกินขีดจำกัดของระบบ", {"max_amount": str(MAX_AMOUNT), "items": too_large}
        )


def check_items(
    items: list[dict[str, Any]], medicines: dict[UUID, dict[str, Any]], today: date
) -> None:
    """Validate purchase items against each other, the medicine table and today (D10)."""
    seen: dict[tuple, int] = {}
    duplicates = []
    for index, item in enumerate(items):
        key = (item["medicine_id"], item["lot_number"].strip().casefold(), item["expiry_date"])
        if key in seen:
            duplicates.append({"index": index, "duplicate_of": seen[key], "lot_number": item["lot_number"]})
        else:
            seen[key] = index
    if duplicates:
        raise _validation_error("มีรายการซ้ำ (ยา, Lot และวันหมดอายุเดียวกัน) ในใบเดียวกัน", duplicates)

    unusable = [
        {"index": index, "medicine_id": str(item["medicine_id"])}
        for index, item in enumerate(items)
        if not (medicines.get(item["medicine_id"]) or {}).get("is_active")
    ]
    if unusable:
        raise _validation_error("ไม่พบยาหรือยาถูกปิดการใช้งาน", unusable)

    expired = [
        {
            "index": index,
            "medicine_id": str(item["medicine_id"]),
            "lot_number": item["lot_number"],
            "expiry_date": item["expiry_date"].isoformat(),
            "today": today.isoformat(),
        }
        for index, item in enumerate(items)
        if item["expiry_date"] <= today
    ]
    if expired:
        raise _validation_error(MSG_EXPIRED, expired)


# --- data access (small helpers so tests can replace them) -----------------------------------


def _supplier_exists(cur, supplier_id: UUID) -> bool:
    cur.execute("SELECT 1 AS found FROM public.suppliers WHERE id = %s", (supplier_id,))
    return cur.fetchone() is not None


def _load_medicines(cur, medicine_ids: list[UUID]) -> dict[UUID, dict[str, Any]]:
    cur.execute(
        "SELECT id, name, is_active FROM public.medicines WHERE id = ANY(%s)",
        (list(set(medicine_ids)),),
    )
    return {row["id"]: row for row in cur.fetchall()}


def _lock_purchase(cur, purchase_id: UUID) -> dict[str, Any] | None:
    cur.execute("SELECT * FROM public.purchases WHERE id = %s FOR UPDATE", (purchase_id,))
    return cur.fetchone()


def _load_items(cur, purchase_id: UUID) -> list[dict[str, Any]]:
    cur.execute(
        """
        SELECT * FROM public.purchase_items
        WHERE purchase_id = %s
        ORDER BY created_at, expiry_date, lot_number, id
        """,
        (purchase_id,),
    )
    return cur.fetchall()


def _insert_items(
    cur, purchase_id: UUID, items: list[dict[str, Any]], subtotals: list[Decimal]
) -> list[dict[str, Any]]:
    rows = []
    for item, subtotal in zip(items, subtotals):
        cur.execute(
            """
            INSERT INTO public.purchase_items
                (purchase_id, medicine_id, quantity_invoiced, quantity_actual,
                 unit_cost, lot_number, expiry_date, subtotal)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
            RETURNING *
            """,
            (
                purchase_id,
                item["medicine_id"],
                item["quantity_invoiced"],
                item["quantity_actual"],
                money(item["unit_cost"]),
                item["lot_number"].strip(),
                item["expiry_date"],
                subtotal,
            ),
        )
        rows.append(cur.fetchone())
    return rows


def _fetch_detail(cur, purchase_id: UUID) -> dict[str, Any] | None:
    cur.execute(
        """
        SELECT p.*, s.name AS supplier_name, u.full_name AS created_by_name
        FROM public.purchases p
        LEFT JOIN public.suppliers s ON s.id = p.supplier_id
        LEFT JOIN public.user_profiles u ON u.id = p.created_by
        WHERE p.id = %s
        """,
        (purchase_id,),
    )
    purchase = cur.fetchone()
    if purchase is None:
        return None

    cur.execute(
        """
        SELECT pi.*, m.name AS medicine_name
        FROM public.purchase_items pi
        LEFT JOIN public.medicines m ON m.id = pi.medicine_id
        WHERE pi.purchase_id = %s
        ORDER BY pi.created_at, pi.expiry_date, pi.lot_number, pi.id
        """,
        (purchase_id,),
    )
    items = cur.fetchall()

    cur.execute(
        """
        SELECT l.*
        FROM public.medicine_lots l
        JOIN public.purchase_items pi ON pi.id = l.purchase_item_id
        WHERE pi.purchase_id = %s
        ORDER BY l.expiry_date, l.id
        """,
        (purchase_id,),
    )
    lots = cur.fetchall()

    return {
        **purchase,
        "items_subtotal": money(sum((i["subtotal"] for i in items), Decimal("0"))),
        "items": items,
        "lots": lots,
    }


def _validate_purchase(
    cur, supplier_id: UUID, purchase_date: date, items: list[dict[str, Any]], today: date
) -> None:
    if not _supplier_exists(cur, supplier_id):
        raise AppError("NOT_FOUND", "ไม่พบข้อมูลผู้จำหน่าย", 404)
    if purchase_date > today:
        raise _validation_error(
            "วันที่รับสินค้าต้องไม่เกินวันนี้",
            {"purchase_date": purchase_date.isoformat(), "today": today.isoformat()},
        )
    medicines = _load_medicines(cur, [item["medicine_id"] for item in items])
    check_items(items, medicines, today)


def _prepare(cur, data: PurchaseIn) -> tuple[list[dict[str, Any]], list[Decimal], Decimal]:
    today = fetch_business_today(cur)
    items = [item.model_dump() for item in data.items]
    _validate_purchase(cur, data.supplier_id, data.purchase_date, items, today)
    subtotals, items_subtotal, total = compute_totals(items, data.discount_amount, data.tax_amount)
    check_totals(subtotals, items_subtotal, total)
    return items, subtotals, total


# --- use cases ------------------------------------------------------------------------------


def list_purchases(
    *,
    status: str | None,
    supplier_id: UUID | None,
    date_from: date | None,
    date_to: date | None,
    limit: int,
    offset: int,
) -> dict[str, Any]:
    if date_from and date_to and date_from > date_to:
        raise _validation_error(
            "date_from ต้องไม่เกิน date_to",
            {"date_from": date_from.isoformat(), "date_to": date_to.isoformat()},
        )

    conditions: list[sql.Composable] = []
    params: list[Any] = []
    for clause, value in (
        ("p.status = %s", status),
        ("p.supplier_id = %s", supplier_id),
        ("p.purchase_date >= %s", date_from),
        ("p.purchase_date <= %s", date_to),
    ):
        if value is not None:
            conditions.append(sql.SQL(clause))
            params.append(value)
    where = sql.SQL(" WHERE ") + sql.SQL(" AND ").join(conditions) if conditions else sql.SQL("")

    with db.get_transaction() as cur:
        cur.execute(sql.SQL("SELECT count(*) AS total FROM public.purchases p") + where, params)
        total = cur.fetchone()["total"]
        cur.execute(
            sql.SQL(
                """
                SELECT p.id, p.supplier_id, s.name AS supplier_name, p.purchase_date,
                       p.total_amount, p.status, p.created_at,
                       (SELECT count(*) FROM public.purchase_items pi
                        WHERE pi.purchase_id = p.id) AS item_count
                FROM public.purchases p
                LEFT JOIN public.suppliers s ON s.id = p.supplier_id
                """
            )
            + where
            + sql.SQL(" ORDER BY p.purchase_date DESC, p.created_at DESC, p.id LIMIT %s OFFSET %s"),
            [*params, limit, offset],
        )
        items = cur.fetchall()

    return {"items": items, "total": total, "limit": limit, "offset": offset}


def get_purchase(purchase_id: UUID) -> dict[str, Any]:
    with db.get_transaction() as cur:
        detail = _fetch_detail(cur, purchase_id)
    if detail is None:
        raise _purchase_not_found()
    return detail


# D29: เลขที่ใบรับสินค้า R-YYMMDD-NNN. Issued only when the purchase leaves
# draft, so a thrown-away draft never burns a number.
PURCHASE_NO_UNIQUE_CONSTRAINT = "purchases_purchase_no_key"
MAX_PURCHASE_NO_ATTEMPTS = 5
BE_OFFSET = 543


def purchase_no_prefix(business_today: date) -> str:
    """R-690918 for 18 ก.ย. 2569 — Buddhist year, last two digits."""
    buddhist_year = business_today.year + BE_OFFSET
    return f"R-{buddhist_year % 100:02d}{business_today.month:02d}{business_today.day:02d}"


def next_purchase_no(cur, business_today: date) -> str:
    """Read inside the confirm transaction, never before it."""
    prefix = purchase_no_prefix(business_today)
    cur.execute(
        """
        SELECT COALESCE(MAX(split_part(purchase_no, '-', 3)::bigint), 0) AS last_running
        FROM public.purchases
        WHERE purchase_no LIKE %s AND split_part(purchase_no, '-', 3) ~ '^[0-9]+$'
        """,
        (f"{prefix}-%",),
    )
    running = cur.fetchone()["last_running"] + 1
    # At least three digits; past 999 it widens rather than wrapping.
    return f"{prefix}-{running:03d}"


def create_purchase(data: PurchaseIn, actor_id: UUID) -> dict[str, Any]:
    with db.get_transaction() as cur:
        items, subtotals, total = _prepare(cur, data)
        cur.execute(
            """
            INSERT INTO public.purchases
                (supplier_id, purchase_date, invoice_no, discount_amount, tax_amount,
                 total_amount, status, created_by)
            VALUES (%s, %s, %s, %s, %s, %s, 'draft', %s)
            RETURNING *
            """,
            (
                data.supplier_id,
                data.purchase_date,
                data.invoice_no,
                money(data.discount_amount),
                money(data.tax_amount),
                total,
                actor_id,
            ),
        )
        purchase = cur.fetchone()
        item_rows = _insert_items(cur, purchase["id"], items, subtotals)
        write_audit(
            cur, "purchases", purchase["id"], "insert", None,
            {"purchase": purchase, "items": item_rows}, actor_id,
        )
        return _fetch_detail(cur, purchase["id"])


def update_purchase(purchase_id: UUID, data: PurchaseIn, actor_id: UUID) -> dict[str, Any]:
    """PUT: replace header and all items of a draft purchase."""
    with db.get_transaction() as cur:
        current = _lock_purchase(cur, purchase_id)
        if current is None:
            raise _purchase_not_found()
        if current["status"] != "draft":
            raise _invalid_state(current["status"])
        old_items = _load_items(cur, purchase_id)

        items, subtotals, total = _prepare(cur, data)
        cur.execute(
            """
            UPDATE public.purchases
            SET supplier_id = %s, purchase_date = %s, invoice_no = %s,
                discount_amount = %s, tax_amount = %s, total_amount = %s
            WHERE id = %s
            RETURNING *
            """,
            (
                data.supplier_id,
                data.purchase_date,
                data.invoice_no,
                money(data.discount_amount),
                money(data.tax_amount),
                total,
                purchase_id,
            ),
        )
        updated = cur.fetchone()
        cur.execute("DELETE FROM public.purchase_items WHERE purchase_id = %s", (purchase_id,))
        new_items = _insert_items(cur, purchase_id, items, subtotals)
        write_audit(
            cur, "purchases", purchase_id, "update",
            {"purchase": current, "items": old_items},
            {"purchase": updated, "items": new_items},
            actor_id,
        )
        return _fetch_detail(cur, purchase_id)


def delete_purchase(purchase_id: UUID, actor_id: UUID) -> dict[str, Any]:
    with db.get_transaction() as cur:
        current = _lock_purchase(cur, purchase_id)
        if current is None:
            raise _purchase_not_found()
        if current["status"] != "draft":
            raise _invalid_state(current["status"])
        old_items = _load_items(cur, purchase_id)
        cur.execute("DELETE FROM public.purchase_items WHERE purchase_id = %s", (purchase_id,))
        cur.execute("DELETE FROM public.purchases WHERE id = %s", (purchase_id,))
        write_audit(
            cur, "purchases", purchase_id, "delete",
            {"purchase": current, "items": old_items}, None, actor_id,
        )
    return {"id": purchase_id, "deleted": True}


def _confirm_purchase_once(purchase_id: UUID, actor_id: UUID) -> dict[str, Any]:
    """Spec 10.1: create lots + inventory transactions for a draft purchase."""
    with db.get_transaction() as cur:
        purchase = _lock_purchase(cur, purchase_id)
        if purchase is None:
            raise _purchase_not_found()
        if purchase["status"] != "draft":
            raise _invalid_state(purchase["status"])

        # D28: a draft may be saved without it, but nothing is received without it.
        if not (purchase["invoice_no"] or "").strip():
            raise _validation_error("กรุณากรอกเลขที่ใบส่งของก่อนยืนยันรับสินค้า")

        items = _load_items(cur, purchase_id)
        if not items:
            raise _validation_error("ใบรับสินค้าไม่มีรายการ")

        # Re-validate: an expiry date may have passed since the draft was saved.
        today = fetch_business_today(cur)
        _validate_purchase(cur, purchase["supplier_id"], purchase["purchase_date"], items, today)

        lots: list[dict[str, Any]] = []
        discrepancies: list[dict[str, Any]] = []
        for item in items:
            invoiced = item["quantity_invoiced"]
            actual = item["quantity_actual"]
            quantity = actual if actual is not None else invoiced

            if actual is not None and actual != invoiced:
                discrepancies.append(
                    {
                        "medicine_id": item["medicine_id"],
                        "lot_number": item["lot_number"],
                        "invoiced": invoiced,
                        "actual": actual,
                    }
                )

            if quantity <= 0:
                continue

            cur.execute(
                """
                INSERT INTO public.medicine_lots
                    (medicine_id, supplier_id, purchase_item_id, lot_number,
                     quantity_received, quantity_remaining, cost_per_unit,
                     expiry_date, received_date, status)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, 'active')
                RETURNING *
                """,
                (
                    item["medicine_id"],
                    purchase["supplier_id"],
                    item["id"],
                    item["lot_number"],
                    quantity,
                    quantity,
                    item["unit_cost"],
                    item["expiry_date"],
                    today,
                ),
            )
            lot = cur.fetchone()
            cur.execute(
                """
                INSERT INTO public.inventory_transactions
                    (medicine_lot_id, transaction_type, quantity_change,
                     quantity_before, quantity_after, reference_type, reference_id, created_by)
                VALUES (%s, 'purchase', %s, 0, %s, 'purchase', %s, %s)
                """,
                (lot["id"], quantity, quantity, purchase_id, actor_id),
            )
            lots.append(lot)

        new_status = "discrepancy" if discrepancies else "confirmed"
        cur.execute(
            """
            UPDATE public.purchases
            SET status = %s, purchase_no = %s, confirmed_at = now()
            WHERE id = %s
            RETURNING *
            """,
            (new_status, next_purchase_no(cur, today), purchase_id),
        )
        updated = cur.fetchone()
        write_audit(
            cur, "purchases", purchase_id, "update",
            {"purchase": purchase},
            {"purchase": updated, "lots": lots, "discrepancies": discrepancies},
            actor_id,
            reason="confirm",
        )

    return {
        "purchase_id": purchase_id,
        "purchase_no": updated["purchase_no"],
        "status": new_status,
        "confirmed_at": updated["confirmed_at"],
        "lots": [
            {
                "id": lot["id"],
                "medicine_id": lot["medicine_id"],
                "lot_number": lot["lot_number"],
                "quantity": lot["quantity_received"],
                "expiry_date": lot["expiry_date"],
            }
            for lot in lots
        ],
        "discrepancies": discrepancies,
    }


def _is_purchase_no_clash(exc: UniqueViolation) -> bool:
    return getattr(exc.diag, "constraint_name", None) == PURCHASE_NO_UNIQUE_CONSTRAINT


def confirm_purchase(purchase_id: UUID, actor_id: UUID) -> dict[str, Any]:
    """Two people can confirm different purchases at the same instant and read
    the same running number; the unique index rejects the loser and the whole
    confirm replays rather than committing without a number."""
    for attempt in range(1, MAX_PURCHASE_NO_ATTEMPTS + 1):
        try:
            return _confirm_purchase_once(purchase_id, actor_id)
        except UniqueViolation as exc:
            if not _is_purchase_no_clash(exc):
                raise
            if attempt == MAX_PURCHASE_NO_ATTEMPTS:
                raise AppError(
                    "INVALID_STATE",
                    "ออกเลขที่ใบรับสินค้าไม่สำเร็จ กรุณาลองใหม่อีกครั้ง",
                    409,
                    {"attempts": attempt},
                ) from None
    raise RuntimeError("unreachable")
