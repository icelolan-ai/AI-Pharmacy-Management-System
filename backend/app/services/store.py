"""Store profile business logic: exactly one row, read by anyone, written by the owner.

The row is created lazily on the first PATCH, so `get_store_profile()` answers with
an all-null profile instead of 404 while the shop has not filled the form in yet.
All SQL is parameterized.
"""

from typing import Any
from uuid import UUID

from psycopg import sql

from app import db
from app.audit import write_audit
from app.errors import AppError
from app.schemas.store import StoreProfileUpdate

TABLE_NAME = "store_profile"

# Whitelisted writable columns (used as sql.Identifier, never raw strings).
COLUMNS = ("name", "owner_name", "address", "phone", "license_no", "tax_id")

OUT_FIELDS = ("id", *COLUMNS, "updated_at", "updated_by", "updated_by_name")

# Every writer takes this transaction lock first, so two concurrent first-saves
# cannot both try to insert the single row.
_WRITE_LOCK_KEY = 5_005

_SELECT_SQL = """
    SELECT s.id, s.name, s.owner_name, s.address, s.phone, s.license_no, s.tax_id,
           s.updated_at, s.updated_by, p.full_name AS updated_by_name
    FROM public.store_profile s
    LEFT JOIN public.user_profiles p ON p.id = s.updated_by
    LIMIT 1
"""


def _empty_profile() -> dict[str, Any]:
    return dict.fromkeys(OUT_FIELDS)


def _no_changes() -> AppError:
    return AppError("VALIDATION_ERROR", "ไม่มีข้อมูลที่เปลี่ยนแปลง", 400)


def _name_required() -> AppError:
    return AppError("VALIDATION_ERROR", "กรุณากรอกชื่อร้านก่อนบันทึกครั้งแรก", 400)


def get_store_profile() -> dict[str, Any]:
    with db.get_transaction() as cur:
        cur.execute(_SELECT_SQL)
        row = cur.fetchone()
    return row if row is not None else _empty_profile()


def _insert_profile(cur, updates: dict[str, Any], actor_id: UUID) -> dict[str, Any]:
    if not updates.get("name"):
        raise _name_required()
    columns = [c for c in COLUMNS if c in updates]
    cur.execute(
        sql.SQL(
            "INSERT INTO public.store_profile ({cols}, updated_by)"
            " VALUES ({vals}, %s) RETURNING *"
        ).format(
            cols=sql.SQL(", ").join(sql.Identifier(c) for c in columns),
            vals=sql.SQL(", ").join([sql.Placeholder()] * len(columns)),
        ),
        [*(updates[c] for c in columns), actor_id],
    )
    inserted = cur.fetchone()
    write_audit(cur, TABLE_NAME, inserted["id"], "insert", None, inserted, actor_id)
    return inserted


def _update_profile(
    cur, current: dict[str, Any], updates: dict[str, Any], actor_id: UUID
) -> dict[str, Any]:
    changes = {c: updates[c] for c in COLUMNS if c in updates and current[c] != updates[c]}
    if not changes:
        raise _no_changes()
    cur.execute(
        sql.SQL(
            "UPDATE public.store_profile SET {assignments}, updated_by = %s"
            " WHERE id = %s RETURNING *"
        ).format(
            assignments=sql.SQL(", ").join(
                sql.SQL("{} = %s").format(sql.Identifier(c)) for c in changes
            )
        ),
        [*changes.values(), actor_id, current["id"]],
    )
    updated = cur.fetchone()
    write_audit(cur, TABLE_NAME, current["id"], "update", current, updated, actor_id)
    return updated


def update_store_profile(data: StoreProfileUpdate, actor_id: UUID) -> dict[str, Any]:
    updates = data.model_dump(exclude_unset=True)
    if not updates:
        raise _no_changes()

    with db.get_transaction() as cur:
        cur.execute("SELECT pg_advisory_xact_lock(%s)", (_WRITE_LOCK_KEY,))
        cur.execute("SELECT * FROM public.store_profile LIMIT 1 FOR UPDATE")
        current = cur.fetchone()

        if current is None:
            _insert_profile(cur, updates, actor_id)
        else:
            _update_profile(cur, current, updates, actor_id)

        # Re-read so the response carries updated_by_name from user_profiles.
        cur.execute(_SELECT_SQL)
        return cur.fetchone()
