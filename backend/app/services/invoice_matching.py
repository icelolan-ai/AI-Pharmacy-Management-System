"""Matching a reviewed scan to the shop's supplier and medicines (6.5).

Only after review (6.4 review-done) and before a purchase is made (6.6).
The names used are the ones a person confirmed in 6.4 — or, for a field
nobody touched, what our code read. The rules are app/scan/matching.py.

Each choice is kept twice:
  invoice_scan_corrections  header.supplier_id / lines.N.medicine_id —
                            what was proposed first (shown_value) and what the
                            person chose, so 6.7 can measure the proposals
  *_name_aliases            the memory for the next invoice (migration 016)
Both are append-only in the database.

The supplier comes first: medicine memory is per supplier.
"""

from typing import Any
from uuid import UUID

from psycopg.types.json import Jsonb

from app import db
from app.audit import write_audit
from app.errors import AppError
from app.scan.matching import (
    Remembered, conflicts, normalise, propose_medicines, propose_suppliers,
)


def _not_found() -> AppError:
    return AppError("SCAN_NOT_FOUND", "ไม่พบใบที่สแกน", 404)


def _scan(cur, scan_id: UUID, lock: bool = False) -> dict[str, Any]:
    cur.execute(
        "SELECT id, status, extracted, reviewed_at FROM public.invoice_scans WHERE id = %s"
        + (" FOR UPDATE" if lock else ""),
        (scan_id,),
    )
    scan = cur.fetchone()
    if scan is None:
        raise _not_found()
    if scan["status"] != "needs_review" or scan["reviewed_at"] is None or not scan["extracted"]:
        raise AppError("SCAN_NOT_MATCHABLE", "ต้องตรวจใบให้เสร็จก่อน จึงจะจับคู่ยาได้", 409,
                       {"status": scan["status"]})
    return scan


def _corrections(cur, scan_id: UUID) -> dict[str, dict[str, Any]]:
    cur.execute(
        """
        SELECT DISTINCT ON (field_path) field_path, shown_value, person_value, action, changed_at, changed_by
        FROM public.invoice_scan_corrections WHERE scan_id = %s
        ORDER BY field_path, changed_at DESC, id DESC
        """,
        (scan_id,),
    )
    return {row["field_path"]: row for row in cur.fetchall()}


def _confirmed(corrections, path: str, fallback: str | None) -> str | None:
    """What a person settled on in 6.4, else what our code read."""
    return corrections[path]["person_value"] if path in corrections else fallback


def _header(extracted, corrections) -> tuple[str | None, str | None]:
    ai = extracted["ai"]
    text = lambda f: ai[f]["text"] if ai[f]["state"] == "read" else None  # noqa: E731
    return (_confirmed(corrections, "header.supplier_name", text("supplier_name")),
            _confirmed(corrections, "header.invoice_no", text("invoice_no")))


def _lines(extracted, corrections) -> list[dict[str, Any]]:
    out = []
    for line in extracted["derived"]["lines"]:
        n = line["line_no"]
        out.append({
            "line_no": n,
            "name": _confirmed(corrections, f"lines.{n}.name", line["name"]),
            "unit": _confirmed(corrections, f"lines.{n}.unit", line["unit"]),
            "free_goods": line["free_goods"],
        })
    return out


def _remembered(cur, sql: str, params: tuple) -> Remembered | None:
    cur.execute(sql, params)
    row = cur.fetchone()
    return Remembered(str(row["target"]), row["chosen_at"], row["invoice_no"]) if row else None


def _supplier_memory(cur, name: str | None) -> Remembered | None:
    if not normalise(name):
        return None
    return _remembered(cur, "SELECT supplier_id AS target, chosen_at, invoice_no FROM public.supplier_name_aliases"
                            " WHERE invoice_name = %s ORDER BY chosen_at DESC, id DESC LIMIT 1", (normalise(name),))


def _medicine_memory(cur, supplier_id: str, name: str | None) -> Remembered | None:
    if not normalise(name):
        return None
    return _remembered(cur, "SELECT medicine_id AS target, chosen_at, invoice_no FROM public.medicine_name_aliases"
                            " WHERE supplier_id = %s AND invoice_name = %s ORDER BY chosen_at DESC, id DESC LIMIT 1",
                       (supplier_id, normalise(name)))


def _medicines(cur) -> list[dict[str, Any]]:
    cur.execute("SELECT id, name, generic_name, active_ingredient, strength, dosage_form, unit,"
                " coalesce(is_active, true) AS is_active FROM public.medicines")
    return cur.fetchall()


def _suppliers(cur) -> list[dict[str, Any]]:
    cur.execute("SELECT id, name FROM public.suppliers")
    return cur.fetchall()


def _chosen(cur, row: dict[str, Any] | None, table: str) -> dict[str, Any] | None:
    if not row or not row["person_value"]:
        return None
    cur.execute(f"SELECT name FROM public.{table} WHERE id = %s", (row["person_value"],))
    found = cur.fetchone()
    cur.execute("SELECT full_name FROM public.user_profiles WHERE id = %s", (row["changed_by"],))
    who = cur.fetchone()
    return {"id": row["person_value"], "name": found["name"] if found else None, "action": row["action"],
            "changed_at": row["changed_at"], "changed_by_name": who["full_name"] if who else None}


def _as_dict(proposal) -> dict[str, Any]:
    return {"id": proposal.id, "name": proposal.name, "score": proposal.score,
            "reasons": proposal.reasons, "from_memory": proposal.from_memory}


def _state(cur, scan_id: UUID, scan: dict[str, Any]) -> dict[str, Any]:
    corrections = _corrections(cur, scan_id)
    supplier_name, _ = _header(scan["extracted"], corrections)
    supplier_row = corrections.get("header.supplier_id")
    supplier_proposals = propose_suppliers(supplier_name, _suppliers(cur), _supplier_memory(cur, supplier_name))
    supplier_id = supplier_row["person_value"] if supplier_row else None
    medicines = _medicines(cur) if supplier_id else []
    by_id = {str(m["id"]): m for m in medicines}
    lines = []
    for line in _lines(scan["extracted"], corrections):
        row = corrections.get(f"lines.{line['line_no']}.medicine_id")
        proposals, note = ([], None)
        if supplier_id and line["name"]:
            proposals, note = propose_medicines(line["name"], line["unit"], medicines,
                                                _medicine_memory(cur, supplier_id, line["name"]))
        chosen = _chosen(cur, row, "medicines")
        clash = conflicts(line["name"] or "", line["unit"], by_id[chosen["id"]]) if chosen and chosen["id"] in by_id else []
        lines.append({**line, "proposals": [_as_dict(p) for p in proposals], "note": note, "chosen": chosen,
                      "conflicts": [c.__dict__ for c in clash]})
    return {
        "scan_id": scan_id,
        "supplier": {"invoice_name": supplier_name, "proposals": [_as_dict(p) for p in supplier_proposals],
                     "chosen": _chosen(cur, supplier_row, "suppliers")},
        "lines": lines,
        "ready": bool(supplier_id) and all(line["chosen"] for line in lines),
    }


def matches(scan_id: UUID) -> dict[str, Any]:
    with db.get_transaction() as cur:
        return _state(cur, scan_id, _scan(cur, scan_id))


def _record(cur, scan_id: UUID, path: str, ai_value: dict[str, Any], shown: str | None, chosen: str,
            actor_id: UUID) -> None:
    action = "confirmed" if chosen == shown else "changed"
    cur.execute(
        "INSERT INTO public.invoice_scan_corrections (scan_id, field_path, ai_value, shown_value, person_value,"
        " action, changed_by) VALUES (%s, %s, %s, %s, %s, %s, %s) RETURNING id",
        (scan_id, path, Jsonb(ai_value), shown, chosen, action, actor_id),
    )
    row = cur.fetchone()
    write_audit(cur, "invoice_scan_corrections", row["id"], "insert", None,
                {"scan_id": scan_id, "field_path": path, "shown_value": shown, "person_value": chosen,
                 "action": action}, actor_id)


def choose_supplier(scan_id: UUID, supplier_id: UUID, actor_id: UUID) -> dict[str, Any]:
    with db.get_transaction() as cur:
        scan = _scan(cur, scan_id, lock=True)
        cur.execute("SELECT id FROM public.suppliers WHERE id = %s", (supplier_id,))
        if cur.fetchone() is None:
            raise AppError("SUPPLIER_NOT_FOUND", "ไม่พบผู้ขายนี้", 404)
        corrections = _corrections(cur, scan_id)
        name, invoice_no = _header(scan["extracted"], corrections)
        top = propose_suppliers(name, _suppliers(cur), _supplier_memory(cur, name))
        _record(cur, scan_id, "header.supplier_id", scan["extracted"]["ai"]["supplier_name"],
                top[0].id if top else None, str(supplier_id), actor_id)
        if normalise(name):
            cur.execute(
                "INSERT INTO public.supplier_name_aliases (invoice_name, written_name, supplier_id, scan_id,"
                " invoice_no, chosen_by) VALUES (%s, %s, %s, %s, %s, %s)",
                (normalise(name), name, supplier_id, scan_id, invoice_no, actor_id),
            )
        return _state(cur, scan_id, scan)


def choose_medicine(scan_id: UUID, line_no: int, medicine_id: UUID, confirm_conflict: bool,
                    actor_id: UUID) -> dict[str, Any]:
    with db.get_transaction() as cur:
        scan = _scan(cur, scan_id, lock=True)
        corrections = _corrections(cur, scan_id)
        supplier_row = corrections.get("header.supplier_id")
        if not supplier_row:
            raise AppError("SUPPLIER_FIRST", "เลือกผู้ขายก่อน แล้วค่อยจับคู่ยา", 409)
        line = next((entry for entry in _lines(scan["extracted"], corrections) if entry["line_no"] == line_no), None)
        if line is None:
            raise AppError("LINE_NOT_FOUND", "ไม่พบบรรทัดนี้ในใบ", 404)
        medicines = _medicines(cur)
        medicine = next((m for m in medicines if str(m["id"]) == str(medicine_id)), None)
        if medicine is None:
            raise AppError("MEDICINE_NOT_FOUND", "ไม่พบยานี้", 404)
        if not medicine["is_active"]:
            raise AppError("MEDICINE_INACTIVE", "ยานี้ถูกปิดใช้แล้ว เลือกไม่ได้", 409)
        clash = conflicts(line["name"] or "", line["unit"], medicine)
        if clash and not confirm_conflict:
            # 🔴 Chat A ข.: never silently — both values, and confirm again.
            raise AppError("MATCH_CONFLICT", "ยานี้ไม่ตรงกับใบ ตรวจแล้วกดยืนยันอีกครั้งถ้ายังต้องการเลือก", 409,
                           {"conflicts": [c.__dict__ for c in clash]})
        supplier_id = supplier_row["person_value"]
        proposals, _ = (propose_medicines(line["name"], line["unit"], medicines,
                                          _medicine_memory(cur, supplier_id, line["name"]))
                        if line["name"] else ([], None))
        ai_line = next(entry for entry in scan["extracted"]["ai"]["lines"] if entry["line_no"] == line_no)
        _record(cur, scan_id, f"lines.{line_no}.medicine_id", ai_line["name"],
                proposals[0].id if proposals else None, str(medicine_id), actor_id)
        if normalise(line["name"]):
            _, invoice_no = _header(scan["extracted"], corrections)
            cur.execute(
                "INSERT INTO public.medicine_name_aliases (supplier_id, invoice_name, written_name, medicine_id,"
                " scan_id, invoice_no, chosen_by) VALUES (%s, %s, %s, %s, %s, %s, %s)",
                (supplier_id, normalise(line["name"]), line["name"], medicine_id, scan_id, invoice_no, actor_id),
            )
        return _state(cur, scan_id, scan)
