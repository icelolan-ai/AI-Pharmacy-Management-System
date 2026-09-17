"""Supplier business logic. All SQL is parameterized."""

from typing import Any
from uuid import UUID

from psycopg import sql

from app import db
from app.audit import write_audit
from app.errors import AppError
from app.schemas.common import escape_like
from app.schemas.supplier import SupplierCreate, SupplierUpdate
from app.services.medicines import compute_changes

COLUMNS = ("name", "contact_person", "phone", "email", "address", "lead_time_days")

_SELECT_SUPPLIER = sql.SQL(
    """
    SELECT s.id, s.name, s.contact_person, s.phone, s.email, s.address,
           s.lead_time_days, s.created_at, s.updated_at
    FROM public.suppliers s
    """
)


def _not_found() -> AppError:
    return AppError("NOT_FOUND", "ไม่พบข้อมูลผู้จำหน่าย", 404)


def _no_changes() -> AppError:
    return AppError("VALIDATION_ERROR", "ไม่มีข้อมูลที่เปลี่ยนแปลง", 400)


def _fetch_supplier(cur, supplier_id: UUID) -> dict[str, Any] | None:
    cur.execute(_SELECT_SUPPLIER + sql.SQL(" WHERE s.id = %s"), (supplier_id,))
    return cur.fetchone()


def list_suppliers(*, q: str | None, limit: int, offset: int) -> dict[str, Any]:
    conditions: list[sql.Composable] = []
    params: list[Any] = []

    search = (q or "").strip()
    if search:
        conditions.append(sql.SQL("s.name ILIKE %s ESCAPE '\\'"))
        params.append(f"%{escape_like(search)}%")

    where = (
        sql.SQL(" WHERE ") + sql.SQL(" AND ").join(conditions) if conditions else sql.SQL("")
    )

    with db.get_transaction() as cur:
        cur.execute(sql.SQL("SELECT count(*) AS total FROM public.suppliers s") + where, params)
        total = cur.fetchone()["total"]
        cur.execute(
            _SELECT_SUPPLIER + where + sql.SQL(" ORDER BY s.name, s.id LIMIT %s OFFSET %s"),
            [*params, limit, offset],
        )
        items = cur.fetchall()

    return {"items": items, "total": total, "limit": limit, "offset": offset}


def get_supplier(supplier_id: UUID) -> dict[str, Any]:
    with db.get_transaction() as cur:
        row = _fetch_supplier(cur, supplier_id)
    if row is None:
        raise _not_found()
    return row


def create_supplier(data: SupplierCreate, actor_id: UUID) -> dict[str, Any]:
    values = data.model_dump()
    query = sql.SQL("INSERT INTO public.suppliers ({cols}) VALUES ({vals}) RETURNING *").format(
        cols=sql.SQL(", ").join(sql.Identifier(c) for c in COLUMNS),
        vals=sql.SQL(", ").join([sql.Placeholder()] * len(COLUMNS)),
    )
    with db.get_transaction() as cur:
        cur.execute(query, [values[c] for c in COLUMNS])
        inserted = cur.fetchone()
        write_audit(cur, "suppliers", inserted["id"], "insert", None, inserted, actor_id)
        return _fetch_supplier(cur, inserted["id"])


def update_supplier(supplier_id: UUID, data: SupplierUpdate, actor_id: UUID) -> dict[str, Any]:
    updates = data.model_dump(exclude_unset=True)
    if not updates:
        raise _no_changes()

    with db.get_transaction() as cur:
        cur.execute("SELECT * FROM public.suppliers WHERE id = %s FOR UPDATE", (supplier_id,))
        current = cur.fetchone()
        if current is None:
            raise _not_found()

        changes = compute_changes(current, updates)
        if not changes:
            raise _no_changes()

        columns = [c for c in COLUMNS if c in changes]
        query = sql.SQL("UPDATE public.suppliers SET {assignments} WHERE id = %s RETURNING *").format(
            assignments=sql.SQL(", ").join(
                sql.SQL("{} = %s").format(sql.Identifier(c)) for c in columns
            )
        )
        cur.execute(query, [*(changes[c] for c in columns), supplier_id])
        updated = cur.fetchone()
        write_audit(cur, "suppliers", supplier_id, "update", current, updated, actor_id)
        return _fetch_supplier(cur, supplier_id)
