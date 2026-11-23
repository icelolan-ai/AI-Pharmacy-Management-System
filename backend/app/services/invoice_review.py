"""A person reviewing a read scan (6.4 · docs/06-ai-design.md 9 · migration 015).

Three things a person does, each kept apart from what the AI said:
  touch a field   one new row in invoice_scan_corrections — never an edit;
                  the AI's answer in extracted.ai is never written to
                  (กฎข้อ 42; the database refuses UPDATE as well)
  go on           review-done: refused while any field in must_check
                  (D57 · D85 · D87) has not been touched
  reject          with a reason; the scan and its photos stay (D58)

The backend works out `ai_value` (the AI's field) and `shown_value` (what
our code made of it, what the page showed) from the stored reading itself.
Neither is taken from the browser.
"""

import re
from datetime import date
from decimal import Decimal, InvalidOperation
from typing import Any
from uuid import UUID

from psycopg.types.json import Jsonb

from app import db
from app.audit import write_audit
from app.errors import AppError

HEADER_FIELDS = ("supplier_name", "supplier_tax_id", "invoice_no", "doc_date", "due_date")
LINE_FIELDS = ("name", "quantity", "unit", "unit_price", "line_discount", "amount", "lot", "mfg", "exp", "remark")
DATE_FIELDS = {"doc_date", "due_date", "mfg", "exp"}
MONEY_FIELDS = {"unit_price", "line_discount", "amount", "total"}
COUNT_FIELDS = {"quantity"}
TEXT_LIMIT = 300
REASON_LIMIT = 500
REJECTABLE = ("uploaded", "needs_review", "failed")

_PATH = re.compile(r"^(?:header\.(?P<header>[a-z_]+)|lines\.(?P<line>\d+)\.(?P<field>[a-z_]+)|totals\.boxes\.(?P<box>\d+))$")


def _not_found() -> AppError:
    return AppError("SCAN_NOT_FOUND", "ไม่พบใบที่สแกน", 404)


def _bad(message: str, **details) -> AppError:
    return AppError("INVALID_FIELD", message, 400, details or None)


def _baht(satang: int | None) -> str | None:
    return None if satang is None else f"{satang // 100}.{satang % 100:02d}"


def _money_text(text: str | None) -> str | None:
    from app.scan.invoice_reading import money_satang
    return _baht(money_satang(text))


def locate(extracted: dict[str, Any], path: str) -> tuple[str, dict[str, Any], str | None]:
    """(kind, ai_value, shown_value) for a field of this reading, or 400."""
    match = _PATH.match(path or "")
    if not match:
        raise _bad("ไม่รู้จักช่องนี้", field_path=path)
    ai, derived = extracted["ai"], extracted["derived"]
    if match["header"]:
        name = match["header"]
        if name not in HEADER_FIELDS or name not in ai:
            raise _bad("ไม่รู้จักช่องนี้", field_path=path)
        field = ai[name]
        if name in DATE_FIELDS:
            decided = derived.get(name) or {}
            return name, field, decided.get("value") or decided.get("suggested")
        return name, field, field["text"] if field["state"] == "read" else None
    if match["line"]:
        line_no, name = int(match["line"]), match["field"]
        ai_line = next((line for line in ai["lines"] if line["line_no"] == line_no), None)
        line = next((entry for entry in derived["lines"] if entry["line_no"] == line_no), None)
        if name not in LINE_FIELDS or ai_line is None or line is None:
            raise _bad("ไม่รู้จักช่องนี้", field_path=path)
        field = ai_line[name]
        shown = {
            "name": line["name"],
            "quantity": None if line["quantity"] is None else str(line["quantity"]),
            "unit": line["unit"],
            "unit_price": _baht(line["unit_price_satang"]),
            "line_discount": _baht(line["line_discount_satang"]),
            "amount": _baht(line["amount_satang"]),
            "lot": line["lot"],
            "mfg": line["mfg"]["value"],
            "exp": line["exp"]["value"],
            "remark": field["text"] if field["state"] == "read" else None,
        }[name]
        return name, field, shown
    index = int(match["box"])
    boxes = ai["totals"]["boxes"]
    if index >= len(boxes):
        raise _bad("ไม่รู้จักช่องนี้", field_path=path)
    field = boxes[index]["amount"]
    return "total", field, _money_text(field["text"]) if field["state"] == "read" else None


def normalise(kind: str, value: str | None) -> str | None:
    """A person's value in the same form the page shows, or 400."""
    if value is None or not value.strip():
        return None
    value = value.strip()
    if kind in DATE_FIELDS:
        try:
            return date.fromisoformat(value).isoformat()
        except ValueError:
            raise _bad("วันที่ไม่ถูกต้อง") from None
    if kind in COUNT_FIELDS:
        if not re.fullmatch(r"\d+", value.replace(",", "")) or int(value.replace(",", "")) <= 0:
            raise _bad("จำนวนต้องเป็นตัวเลขเต็มที่มากกว่า 0")
        return str(int(value.replace(",", "")))
    if kind in MONEY_FIELDS:
        try:
            amount = Decimal(value.replace(",", ""))
        except InvalidOperation:
            raise _bad("ยอดเงินไม่ถูกต้อง") from None
        if amount < 0 or amount != amount.quantize(Decimal("0.01")):
            raise _bad("ยอดเงินต้องไม่ติดลบ และมีทศนิยมไม่เกิน 2 ตำแหน่ง")
        return f"{amount:.2f}"
    if len(value) > TEXT_LIMIT:
        raise _bad(f"ยาวเกิน {TEXT_LIMIT} ตัวอักษร")
    return value


def _lock(cur, scan_id: UUID) -> dict[str, Any]:
    cur.execute(
        "SELECT id, status, extracted, reviewed_at FROM public.invoice_scans WHERE id = %s FOR UPDATE",
        (scan_id,),
    )
    scan = cur.fetchone()
    if scan is None:
        raise _not_found()
    return scan


def _reviewable(scan: dict[str, Any]) -> None:
    if scan["status"] != "needs_review" or scan["extracted"] is None:
        raise AppError("SCAN_NOT_REVIEWABLE", "ใบนี้ยังตรวจไม่ได้ หรือไม่ได้อยู่ในสถานะรอตรวจ", 409,
                       {"status": scan["status"]})
    if scan["reviewed_at"] is not None:
        raise AppError("SCAN_ALREADY_REVIEWED", "ใบนี้ตรวจเสร็จแล้ว แก้ช่องไม่ได้อีก", 409)


def current(cur, scan_id: UUID) -> list[dict[str, Any]]:
    """The latest row of every touched field."""
    cur.execute(
        """
        SELECT DISTINCT ON (c.field_path) c.field_path, c.shown_value, c.person_value, c.action,
               c.changed_at, c.changed_by, p.full_name AS changed_by_name
        FROM public.invoice_scan_corrections c
        LEFT JOIN public.user_profiles p ON p.id = c.changed_by
        WHERE c.scan_id = %s
        ORDER BY c.field_path, c.changed_at DESC, c.id DESC
        """,
        (scan_id,),
    )
    return cur.fetchall()


def untouched(extracted: dict[str, Any] | None, touched: list[dict[str, Any]]) -> list[str]:
    if not extracted:
        return []
    done = {row["field_path"] for row in touched}
    return [path for path in extracted["derived"].get("must_check", []) if path not in done]


def touch(scan_id: UUID, field_path: str, action: str, person_value: str | None, actor_id: UUID) -> dict[str, Any]:
    with db.get_transaction() as cur:
        scan = _lock(cur, scan_id)
        _reviewable(scan)
        kind, ai_value, shown = locate(scan["extracted"], field_path)
        if action == "confirmed":
            # Confirming takes exactly what was shown. Confirming "nothing" is
            # right only for a field that is not on the paper (D62); a date
            # read two ways, a repeat mark or an unreadable field must be
            # chosen or typed, not waved through.
            if shown is None and ai_value["state"] != "absent":
                raise _bad("ช่องนี้ยังไม่มีค่าให้ยืนยัน ต้องเลือกหรือกรอกค่าเอง", field_path=field_path)
            value = shown
        else:
            value = normalise(kind, person_value)
            if value == shown:
                raise _bad("ค่าที่แก้ตรงกับที่ระบบแสดงอยู่แล้ว ให้กดยืนยันแทน")
        cur.execute(
            """
            INSERT INTO public.invoice_scan_corrections
                (scan_id, field_path, ai_value, shown_value, person_value, action, changed_by)
            VALUES (%s, %s, %s, %s, %s, %s, %s)
            RETURNING id, field_path, shown_value, person_value, action, changed_at
            """,
            (scan_id, field_path, Jsonb(ai_value), shown, value, action, actor_id),
        )
        row = cur.fetchone()
        write_audit(cur, "invoice_scan_corrections", row["id"], "insert", None,
                    {"scan_id": scan_id, **row}, actor_id)
        rows = current(cur, scan_id)
    return {**row, "untouched": untouched(scan["extracted"], rows)}


def review_done(scan_id: UUID, actor_id: UUID) -> dict[str, Any]:
    with db.get_transaction() as cur:
        scan = _lock(cur, scan_id)
        _reviewable(scan)
        left = untouched(scan["extracted"], current(cur, scan_id))
        if left:
            raise AppError("FIELDS_NOT_CHECKED", f"ยังต้องตรวจอีก {len(left)} ช่อง", 409, {"untouched": left})
        cur.execute(
            "UPDATE public.invoice_scans SET reviewed_at = now(), reviewed_by = %s WHERE id = %s"
            " RETURNING id, status, reviewed_at, reviewed_by",
            (actor_id, scan_id),
        )
        row = cur.fetchone()
        write_audit(cur, "invoice_scans", scan_id, "update", {"reviewed_at": None}, row, actor_id,
                    reason="ตรวจใบเสร็จ")
    return row


def reject(scan_id: UUID, reason: str, actor_id: UUID) -> dict[str, Any]:
    reason = (reason or "").strip()
    if not reason:
        raise _bad("ต้องบอกเหตุผลที่ปฏิเสธใบนี้")
    if len(reason) > REASON_LIMIT:
        raise _bad(f"เหตุผลยาวเกิน {REASON_LIMIT} ตัวอักษร")
    with db.get_transaction() as cur:
        scan = _lock(cur, scan_id)
        if scan["status"] not in REJECTABLE:
            raise AppError("SCAN_NOT_REJECTABLE", "ใบนี้ปฏิเสธไม่ได้ในสถานะนี้", 409, {"status": scan["status"]})
        cur.execute(
            "UPDATE public.invoice_scans SET status = 'rejected', rejected_reason = %s, rejected_by = %s,"
            " rejected_at = now(), failed_reason = NULL WHERE id = %s"
            " RETURNING id, status, rejected_reason, rejected_at, rejected_by",
            (reason, actor_id, scan_id),
        )
        row = cur.fetchone()
        write_audit(cur, "invoice_scans", scan_id, "update", {"status": scan["status"]}, row, actor_id,
                    reason="ปฏิเสธใบ")
    return row
