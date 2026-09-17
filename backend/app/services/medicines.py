"""Medicine business logic. All SQL is parameterized."""

from typing import Any
from uuid import UUID

from psycopg import sql
from psycopg.errors import UniqueViolation

from app import db
from app.audit import write_audit
from app.errors import AppError
from app.schemas.common import escape_like
from app.schemas.medicine import MedicineCreate, MedicineUpdate

BARCODE_UNIQUE_CONSTRAINT = "medicines_barcode_key"

# Whitelisted writable columns (used as sql.Identifier, never raw strings).
CREATE_COLUMNS = (
    "name",
    "generic_name",
    "strength",
    "dosage_form",
    "manufacturer",
    "category",
    "barcode",
    "active_ingredient",
    "reorder_point",
    "selling_price",
)
UPDATE_COLUMNS = (*CREATE_COLUMNS, "is_active")

# Sellable stock: active lots with quantity left that have not expired.
_SELECT_MEDICINE = sql.SQL(
    """
    SELECT m.id, m.name, m.generic_name, m.strength, m.dosage_form, m.manufacturer,
           m.category, m.barcode, m.active_ingredient, m.reorder_point,
           m.selling_price, m.is_active, m.created_at, m.updated_at,
           COALESCE((
               SELECT SUM(l.quantity_remaining)
               FROM public.medicine_lots l
               WHERE l.medicine_id = m.id
                 AND l.status = 'active'
                 AND l.quantity_remaining > 0
                 AND l.expiry_date >= CURRENT_DATE
           ), 0) AS available_quantity
    FROM public.medicines m
    """
)


def _not_found() -> AppError:
    return AppError("NOT_FOUND", "ไม่พบข้อมูลยา", 404)


def _no_changes() -> AppError:
    return AppError("VALIDATION_ERROR", "ไม่มีข้อมูลที่เปลี่ยนแปลง", 400)


def _duplicate_barcode_or_reraise(exc: UniqueViolation) -> None:
    if getattr(exc.diag, "constraint_name", None) == BARCODE_UNIQUE_CONSTRAINT:
        raise AppError("DUPLICATE", "Barcode นี้มีอยู่ในระบบแล้ว", 409) from None
    raise exc


def compute_changes(current: dict[str, Any], updates: dict[str, Any]) -> dict[str, Any]:
    return {key: value for key, value in updates.items() if current.get(key) != value}


def _fetch_medicine(cur, medicine_id: UUID) -> dict[str, Any] | None:
    cur.execute(_SELECT_MEDICINE + sql.SQL(" WHERE m.id = %s"), (medicine_id,))
    return cur.fetchone()


def list_medicines(
    *,
    q: str | None,
    category: str | None,
    is_active: bool,
    limit: int,
    offset: int,
) -> dict[str, Any]:
    conditions = [sql.SQL("m.is_active = %s")]
    params: list[Any] = [is_active]

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

    with db.get_transaction() as cur:
        cur.execute(sql.SQL("SELECT count(*) AS total FROM public.medicines m") + where, params)
        total = cur.fetchone()["total"]
        cur.execute(
            _SELECT_MEDICINE + where + sql.SQL(" ORDER BY m.name, m.id LIMIT %s OFFSET %s"),
            [*params, limit, offset],
        )
        items = cur.fetchall()

    return {"items": items, "total": total, "limit": limit, "offset": offset}


def get_medicine(medicine_id: UUID) -> dict[str, Any]:
    with db.get_transaction() as cur:
        row = _fetch_medicine(cur, medicine_id)
    if row is None:
        raise _not_found()
    return row


def get_medicine_by_barcode(barcode: str) -> dict[str, Any]:
    code = barcode.strip()
    if not code:
        raise _not_found()
    with db.get_transaction() as cur:
        cur.execute(_SELECT_MEDICINE + sql.SQL(" WHERE m.barcode = %s"), (code,))
        row = cur.fetchone()
    if row is None:
        raise _not_found()
    return row


def create_medicine(data: MedicineCreate, actor_id: UUID) -> dict[str, Any]:
    values = data.model_dump()
    query = sql.SQL("INSERT INTO public.medicines ({cols}) VALUES ({vals}) RETURNING *").format(
        cols=sql.SQL(", ").join(sql.Identifier(c) for c in CREATE_COLUMNS),
        vals=sql.SQL(", ").join([sql.Placeholder()] * len(CREATE_COLUMNS)),
    )
    try:
        with db.get_transaction() as cur:
            cur.execute(query, [values[c] for c in CREATE_COLUMNS])
            inserted = cur.fetchone()
            write_audit(cur, "medicines", inserted["id"], "insert", None, inserted, actor_id)
            return _fetch_medicine(cur, inserted["id"])
    except UniqueViolation as exc:
        _duplicate_barcode_or_reraise(exc)


def update_medicine(medicine_id: UUID, data: MedicineUpdate, actor_id: UUID) -> dict[str, Any]:
    updates = data.model_dump(exclude_unset=True)
    if not updates:
        raise _no_changes()

    try:
        with db.get_transaction() as cur:
            cur.execute(
                "SELECT * FROM public.medicines WHERE id = %s FOR UPDATE", (medicine_id,)
            )
            current = cur.fetchone()
            if current is None:
                raise _not_found()

            changes = compute_changes(current, updates)
            if not changes:
                raise _no_changes()

            columns = [c for c in UPDATE_COLUMNS if c in changes]
            query = sql.SQL("UPDATE public.medicines SET {assignments} WHERE id = %s RETURNING *").format(
                assignments=sql.SQL(", ").join(
                    sql.SQL("{} = %s").format(sql.Identifier(c)) for c in columns
                )
            )
            cur.execute(query, [*(changes[c] for c in columns), medicine_id])
            updated = cur.fetchone()
            write_audit(cur, "medicines", medicine_id, "update", current, updated, actor_id)
            return _fetch_medicine(cur, medicine_id)
    except UniqueViolation as exc:
        _duplicate_barcode_or_reraise(exc)
