"""ผังร้าน (U-8) business logic.

One active map per shop for now; the tables already allow several, so the day
the shop wants an upstairs there is no second migration.

Everything the browser draws comes from here as integers in millimetres. The
browser places dots; it never totals anything.

All SQL is parameterized, and dynamic column lists go through
psycopg.sql.Identifier — the same rules as every other service.
"""

from typing import Any
from uuid import UUID

from psycopg import errors as pg_errors
from psycopg import sql

from app import db
from app.audit import write_audit
from app.errors import AppError
from app.schemas.store_map import (
    MAX_POINTS,
    MAX_SHAPES,
    PointCreate,
    PointUpdate,
    ShapeCreate,
    ShapeUpdate,
    StoreMapUpsert,
)

MAP_TABLE = "store_maps"
SHAPE_TABLE = "store_map_shapes"
POINT_TABLE = "store_map_points"

SHAPE_COLUMNS = (
    "kind",
    "label",
    "x_mm",
    "y_mm",
    "width_mm",
    "height_mm",
    "rotation_deg",
    "height_z_mm",
    "sort_order",
)
POINT_COLUMNS = ("code", "name", "detail", "x_mm", "y_mm")

# One writer at a time, so two people adding the 1000th point cannot both pass
# the count, and two first-saves cannot both create the map.
_WRITE_LOCK_KEY = 5_009

_MAP_SELECT = """
    SELECT m.id, m.name, m.width_mm, m.height_mm,
           m.updated_at, m.updated_by, p.full_name AS updated_by_name
    FROM public.store_maps m
    LEFT JOIN public.user_profiles p ON p.id = m.updated_by
    WHERE m.is_active
    ORDER BY m.created_at DESC, m.id
    LIMIT 1
"""

_SHAPE_SELECT = """
    SELECT id, map_id, kind, label, x_mm, y_mm, width_mm, height_mm,
           rotation_deg, height_z_mm, sort_order
    FROM public.store_map_shapes
    WHERE map_id = %s
    ORDER BY sort_order, id
"""

# medicine_count is counted here rather than by loading the links and adding
# them up in the browser.
_POINT_SELECT = """
    SELECT p.id, p.map_id, p.code, p.name, p.detail, p.x_mm, p.y_mm,
           count(pm.medicine_id)::int AS medicine_count
    FROM public.store_map_points p
    LEFT JOIN public.store_map_point_medicines pm ON pm.point_id = p.id
    WHERE p.map_id = %s
    GROUP BY p.id
    ORDER BY p.code, p.id
"""


def _validation_error(message: str, details: Any = None) -> AppError:
    return AppError("VALIDATION_ERROR", message, 400, details)


def _not_found(message: str) -> AppError:
    return AppError("NOT_FOUND", message, 404)


def _duplicate_code(code: str) -> AppError:
    return AppError("CONFLICT", f"มีจุดรหัส {code} อยู่แล้วในผังนี้", 409, {"code": code})


def _active_map(cur) -> dict[str, Any] | None:
    cur.execute(_MAP_SELECT)
    return cur.fetchone()


def _require_map(cur) -> dict[str, Any]:
    found = _active_map(cur)
    if found is None:
        raise _not_found("ยังไม่มีผังร้าน กรุณาสร้างผังก่อน")
    return found


def _check_inside(map_row: dict[str, Any], x: int, y: int, width: int = 0, height: int = 0) -> None:
    """Nothing may be placed outside the room.

    The database cannot express this: the limit lives in another table's row,
    and a CHECK may not look there.
    """
    if x + width > map_row["width_mm"] or y + height > map_row["height_mm"]:
        raise _validation_error(
            "ตำแหน่งอยู่นอกกรอบผังร้าน",
            {
                "x_mm": x,
                "y_mm": y,
                "map_width_mm": map_row["width_mm"],
                "map_height_mm": map_row["height_mm"],
            },
        )


def _count(cur, table: str, map_id: UUID) -> int:
    cur.execute(
        sql.SQL("SELECT count(*) AS n FROM public.{} WHERE map_id = %s").format(
            sql.Identifier(table)
        ),
        (map_id,),
    )
    return cur.fetchone()["n"]


def get_store_map_view() -> dict[str, Any]:
    """The whole map in one answer. No map yet is not an error (U-8.3 says so
    in words instead of drawing an empty room)."""
    with db.get_transaction() as cur:
        map_row = _active_map(cur)
        if map_row is None:
            return {"map": None, "shapes": [], "points": []}
        cur.execute(_SHAPE_SELECT, (map_row["id"],))
        shapes = cur.fetchall()
        cur.execute(_POINT_SELECT, (map_row["id"],))
        points = cur.fetchall()
    return {"map": map_row, "shapes": shapes, "points": points}


def upsert_store_map(data: StoreMapUpsert, actor_id: UUID) -> dict[str, Any]:
    """Create the shop's map, or rename/resize the one it has.

    Shrinking the room below something already placed is refused rather than
    silently leaving a shelf outside the wall.
    """
    with db.get_transaction() as cur:
        cur.execute("SELECT pg_advisory_xact_lock(%s)", (_WRITE_LOCK_KEY,))
        current = _active_map(cur)

        if current is None:
            cur.execute(
                "INSERT INTO public.store_maps (name, width_mm, height_mm, updated_by)"
                " VALUES (%s, %s, %s, %s) RETURNING *",
                (data.name, data.width_mm, data.height_mm, actor_id),
            )
            inserted = cur.fetchone()
            write_audit(cur, MAP_TABLE, inserted["id"], "insert", None, inserted, actor_id)
        else:
            cur.execute(
                "SELECT max(x_mm + width_mm) AS w, max(y_mm + height_mm) AS h"
                " FROM public.store_map_shapes WHERE map_id = %s",
                (current["id"],),
            )
            used = cur.fetchone()
            cur.execute(
                "SELECT max(x_mm) AS w, max(y_mm) AS h FROM public.store_map_points"
                " WHERE map_id = %s",
                (current["id"],),
            )
            marked = cur.fetchone()
            needed_w = max(used["w"] or 0, marked["w"] or 0)
            needed_h = max(used["h"] or 0, marked["h"] or 0)
            if data.width_mm < needed_w or data.height_mm < needed_h:
                raise _validation_error(
                    "ย่อผังเล็กกว่าของที่วางไว้แล้วไม่ได้",
                    {"needed_width_mm": needed_w, "needed_height_mm": needed_h},
                )
            cur.execute(
                "UPDATE public.store_maps SET name = %s, width_mm = %s, height_mm = %s,"
                " updated_by = %s WHERE id = %s RETURNING *",
                (data.name, data.width_mm, data.height_mm, actor_id, current["id"]),
            )
            updated = cur.fetchone()
            write_audit(cur, MAP_TABLE, current["id"], "update", current, updated, actor_id)

        cur.execute(_MAP_SELECT)
        return cur.fetchone()


def _insert_row(cur, table: str, map_id: UUID, values: dict[str, Any]) -> dict[str, Any]:
    columns = list(values)
    cur.execute(
        sql.SQL(
            "INSERT INTO public.{table} (map_id, {cols}) VALUES (%s, {vals}) RETURNING *"
        ).format(
            table=sql.Identifier(table),
            cols=sql.SQL(", ").join(sql.Identifier(c) for c in columns),
            vals=sql.SQL(", ").join([sql.Placeholder()] * len(columns)),
        ),
        [map_id, *(values[c] for c in columns)],
    )
    return cur.fetchone()


def _update_row(cur, table: str, row_id: UUID, changes: dict[str, Any]) -> dict[str, Any]:
    cur.execute(
        sql.SQL("UPDATE public.{table} SET {assignments} WHERE id = %s RETURNING *").format(
            table=sql.Identifier(table),
            assignments=sql.SQL(", ").join(
                sql.SQL("{} = %s").format(sql.Identifier(c)) for c in changes
            ),
        ),
        [*changes.values(), row_id],
    )
    return cur.fetchone()


def _fetch_one(cur, table: str, row_id: UUID, missing: str) -> dict[str, Any]:
    cur.execute(
        sql.SQL("SELECT * FROM public.{} WHERE id = %s").format(sql.Identifier(table)),
        (row_id,),
    )
    row = cur.fetchone()
    if row is None:
        raise _not_found(missing)
    return row


def _shape_out(cur, shape_id: UUID) -> dict[str, Any]:
    cur.execute(
        "SELECT id, map_id, kind, label, x_mm, y_mm, width_mm, height_mm,"
        " rotation_deg, height_z_mm, sort_order"
        " FROM public.store_map_shapes WHERE id = %s",
        (shape_id,),
    )
    return cur.fetchone()


def _point_out(cur, point_id: UUID) -> dict[str, Any]:
    cur.execute(
        "SELECT p.id, p.map_id, p.code, p.name, p.detail, p.x_mm, p.y_mm,"
        " count(pm.medicine_id)::int AS medicine_count"
        " FROM public.store_map_points p"
        " LEFT JOIN public.store_map_point_medicines pm ON pm.point_id = p.id"
        " WHERE p.id = %s GROUP BY p.id",
        (point_id,),
    )
    return cur.fetchone()


def create_shape(data: ShapeCreate, actor_id: UUID) -> dict[str, Any]:
    with db.get_transaction() as cur:
        cur.execute("SELECT pg_advisory_xact_lock(%s)", (_WRITE_LOCK_KEY,))
        map_row = _require_map(cur)
        _check_inside(map_row, data.x_mm, data.y_mm, data.width_mm, data.height_mm)
        if _count(cur, SHAPE_TABLE, map_row["id"]) >= MAX_SHAPES:
            raise _validation_error(f"ผังหนึ่งผังมีของได้ไม่เกิน {MAX_SHAPES} ชิ้น")
        values = {c: getattr(data, c) for c in SHAPE_COLUMNS}
        inserted = _insert_row(cur, SHAPE_TABLE, map_row["id"], values)
        write_audit(cur, SHAPE_TABLE, inserted["id"], "insert", None, inserted, actor_id)
        return _shape_out(cur, inserted["id"])


def update_shape(shape_id: UUID, data: ShapeUpdate, actor_id: UUID) -> dict[str, Any]:
    updates = data.model_dump(exclude_unset=True)
    if not updates:
        raise _validation_error("ไม่มีข้อมูลที่เปลี่ยนแปลง")
    with db.get_transaction() as cur:
        cur.execute("SELECT pg_advisory_xact_lock(%s)", (_WRITE_LOCK_KEY,))
        current = _fetch_one(cur, SHAPE_TABLE, shape_id, "ไม่พบของชิ้นนี้ในผัง")
        map_row = _require_map(cur)
        merged = {**current, **updates}
        _check_inside(
            map_row, merged["x_mm"], merged["y_mm"], merged["width_mm"], merged["height_mm"]
        )
        changes = {c: updates[c] for c in SHAPE_COLUMNS if c in updates and current[c] != updates[c]}
        if not changes:
            raise _validation_error("ไม่มีข้อมูลที่เปลี่ยนแปลง")
        updated = _update_row(cur, SHAPE_TABLE, shape_id, changes)
        write_audit(cur, SHAPE_TABLE, shape_id, "update", current, updated, actor_id)
        return _shape_out(cur, shape_id)


def delete_shape(shape_id: UUID, actor_id: UUID) -> None:
    with db.get_transaction() as cur:
        current = _fetch_one(cur, SHAPE_TABLE, shape_id, "ไม่พบของชิ้นนี้ในผัง")
        cur.execute("DELETE FROM public.store_map_shapes WHERE id = %s", (shape_id,))
        write_audit(cur, SHAPE_TABLE, shape_id, "delete", current, None, actor_id)


def create_point(data: PointCreate, actor_id: UUID) -> dict[str, Any]:
    with db.get_transaction() as cur:
        cur.execute("SELECT pg_advisory_xact_lock(%s)", (_WRITE_LOCK_KEY,))
        map_row = _require_map(cur)
        _check_inside(map_row, data.x_mm, data.y_mm)
        if _count(cur, POINT_TABLE, map_row["id"]) >= MAX_POINTS:
            raise _validation_error(f"ผังหนึ่งผังมีจุดได้ไม่เกิน {MAX_POINTS} จุด")
        values = {c: getattr(data, c) for c in POINT_COLUMNS}
        try:
            inserted = _insert_row(cur, POINT_TABLE, map_row["id"], values)
        except pg_errors.UniqueViolation as exc:
            raise _duplicate_code(data.code) from exc
        write_audit(cur, POINT_TABLE, inserted["id"], "insert", None, inserted, actor_id)
        return _point_out(cur, inserted["id"])


def update_point(point_id: UUID, data: PointUpdate, actor_id: UUID) -> dict[str, Any]:
    updates = data.model_dump(exclude_unset=True)
    if not updates:
        raise _validation_error("ไม่มีข้อมูลที่เปลี่ยนแปลง")
    with db.get_transaction() as cur:
        cur.execute("SELECT pg_advisory_xact_lock(%s)", (_WRITE_LOCK_KEY,))
        current = _fetch_one(cur, POINT_TABLE, point_id, "ไม่พบจุดนี้ในผัง")
        map_row = _require_map(cur)
        merged = {**current, **updates}
        _check_inside(map_row, merged["x_mm"], merged["y_mm"])
        changes = {c: updates[c] for c in POINT_COLUMNS if c in updates and current[c] != updates[c]}
        if not changes:
            raise _validation_error("ไม่มีข้อมูลที่เปลี่ยนแปลง")
        try:
            updated = _update_row(cur, POINT_TABLE, point_id, changes)
        except pg_errors.UniqueViolation as exc:
            raise _duplicate_code(str(changes.get("code", ""))) from exc
        write_audit(cur, POINT_TABLE, point_id, "update", current, updated, actor_id)
        return _point_out(cur, point_id)


def delete_point(point_id: UUID, actor_id: UUID) -> None:
    """The links to medicines go with it (on delete cascade), which is what the
    shop means by removing a mark."""
    with db.get_transaction() as cur:
        current = _fetch_one(cur, POINT_TABLE, point_id, "ไม่พบจุดนี้ในผัง")
        cur.execute("DELETE FROM public.store_map_points WHERE id = %s", (point_id,))
        write_audit(cur, POINT_TABLE, point_id, "delete", current, None, actor_id)
