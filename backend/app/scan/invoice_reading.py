"""From what the AI copied to what it means (6.3 · D84).

The AI hands back text as it stood on the paper (invoice_answer.py). Every
rule that turns that text into numbers, dates, free goods and total checks
lives here, as plain code with no database and no network, so each rule is
tested by calling it (D43-a) and none of it changes when the model does.

Nothing here decides for a person. Where the paper does not settle a
question, the line gets a flag saying which field and why, and the value is
left empty rather than guessed (D64). Flags only ever add work for a person;
nothing here lets one skip a check (D85).

Rules, with where they come from:
  money       "1,250.00" -> 125000 satang; anything else is not guessed
  dates       D64: header year 4 digits >= 2400 is พ.ศ.; line years of 2
              digits are ค.ศ. 20yy; day/month settled from unambiguous dates
              of the same field in the same document, else a person decides.
              D87: never across kinds. The header date is printed by the
              supplier's system, MFG/EXP come from the maker's lot code: one
              never settles the other. A header date nothing settles gets a
              suggestion — the candidate closest to the upload day and not
              after it — which a person must confirm once.
              D16: month/year only -> last day of the month, and it says the
              day was filled in by the system, not read.
  quantity    a count; "5 กล่อง" in one column is count 5, unit กล่อง when
              the paper has no separate unit
  free goods  D59: a quantity, and price and amount both absent from the
              paper. Unreadable is not absent (D62): that line goes to a person.
  repeat      D63: carried from an earlier line only when the AI was sure
              and that line exists and has a name; a name that looks like a
              repeat mark the AI did not report is flagged.
  totals      D61: labels mapped by the words printed, then 5 checks, each run
              only when every box it needs is on the paper.
"""

import calendar
import re
from datetime import date
from decimal import ROUND_HALF_UP, Decimal
from typing import Any

from app.scan.invoice_answer import FieldValue, InvoiceAnswer, Line

# D72: guessed, not measured. Review after real invoices (Chat A, 6.3).
TOLERANCE_SATANG = 1
# D57 (D72: guessed, review in 6.7). D85 — confidence may only add a flag,
# never remove one. Quantities, money and expiry need more certainty.
LOW_CONFIDENCE = 0.80
LOW_CONFIDENCE_STRICT = 0.90
STRICT_FIELDS = frozenset({"quantity", "unit_price", "line_discount", "amount", "exp", "total_amount"})
VAT_RATE = Decimal("1.07")

_MONEY = re.compile(r"^(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d{1,2})?$")
_COUNT = re.compile(r"^(?:\d{1,3}(?:,\d{3})+|\d+)$")
# "5 กล่อง": a count and its unit written in one column, as handwritten notes
# do (seen on the fake handwritten note, 22 Nov — the AI copied it as written).
_COUNT_AND_UNIT = re.compile(r"^((?:\d{1,3}(?:,\d{3})+|\d+))\s+(\S.*)$")
_DAY_MONTH_YEAR = re.compile(r"^(\d{1,2})[./-](\d{1,2})[./-](\d{4}|\d{2})$")
_MONTH_YEAR = re.compile(r"^(\d{1,2})[./-](\d{4}|\d{2})$")
_REPEAT_LOOK = re.compile(r"^\s*(?:-{2,}|_{2,}|[\"“”〃]+(?:\s+[\"“”〃]+)*)")

# Printed words -> the part they play (D61). Matched on the words with the
# spaces taken out. Only labels seen on real paper (type A) or on the fake
# invoices are here; anything else is shown to a person, not guessed.
LABEL_ROLES = {
    "รวมเงิน": "gross",
    "ยอดรวม": "gross",
    "รวม": "gross",
    "ส่วนลด": "discount",
    "ยอดเงินหลังหักส่วนลด": "base_before_vat",
    "จำนวนเงินรวมทั้งสิ้น": "net",
    "รวมเงินทั้งสิ้น": "net",
    "ยอดสุทธิ": "net",
}


# --- small readers ---------------------------------------------------------

def money_satang(text: str | None) -> int | None:
    """'1,250.00' -> 125000. Anything that is not plainly money -> None."""
    if text is None:
        return None
    cleaned = text.strip()
    if not _MONEY.match(cleaned):
        return None
    return int((Decimal(cleaned.replace(",", "")) * 100).to_integral_value())


def count(text: str | None) -> int | None:
    if text is None:
        return None
    cleaned = text.strip()
    if not _COUNT.match(cleaned):
        return None
    return int(cleaned.replace(",", ""))


def _year(digits: str, *, in_header: bool) -> int | None:
    """D64. None when the era cannot be told from the paper."""
    value = int(digits)
    if len(digits) == 4:
        if value >= 2400:
            return value - 543          # พ.ศ.
        if 1900 <= value < 2400:
            return value                # ค.ศ.
        return None
    # Two digits: on product lines they are ค.ศ. (D64); on the header the
    # era is not settled by anything written down.
    return None if in_header else 2000 + value


def _order_of(first: int, second: int) -> str | None:
    """Which way round a date is written, when the numbers alone say so."""
    if first > 12 and second <= 12:
        return "day_first"
    if second > 12 and first <= 12:
        return "month_first"
    return None


def _make(year: int, month: int, day: int) -> date | None:
    try:
        return date(year, month, day)
    except ValueError:
        return None


class _DateText:
    """One date as written, split into its parts, not yet decided."""

    def __init__(self, field: FieldValue, *, in_header: bool):
        self.field = field
        self.in_header = in_header
        self.kind = "absent" if field.state == "absent" else "unreadable" if field.state == "unreadable" else None
        self.first = self.second = None
        self.year: int | None = None
        self.month_year = False
        if self.kind:
            return
        text = (field.text or "").strip()
        full = _DAY_MONTH_YEAR.match(text)
        short = _MONTH_YEAR.match(text)
        if full:
            self.first, self.second = int(full.group(1)), int(full.group(2))
            self.year = _year(full.group(3), in_header=in_header)
            self.kind = "era_unknown" if self.year is None else "date"
        elif short:
            self.month_year = True
            self.second = int(short.group(1))
            self.year = _year(short.group(2), in_header=in_header)
            self.kind = "era_unknown" if self.year is None else "month_year"
        else:
            self.kind = "not_a_date"

    def evidence(self) -> str | None:
        return _order_of(self.first, self.second) if self.kind == "date" else None


def _decide(dt: _DateText, settled: str | None, settled_from: list[int]) -> dict[str, Any]:
    """The date as kept: the text, the value, and how it was decided."""
    out: dict[str, Any] = {"text": dt.field.text, "state": dt.field.state, "value": None,
                           "ambiguous": False, "candidates": [], "how": dt.kind,
                           "day_filled_by_system": False}
    if dt.kind in ("absent", "unreadable", "not_a_date", "era_unknown"):
        return out
    if dt.kind == "month_year":
        if not 1 <= dt.second <= 12:
            out["how"] = "not_a_date"
            return out
        last = calendar.monthrange(dt.year, dt.second)[1]
        out.update(value=date(dt.year, dt.second, last).isoformat(),
                   how="month_year_last_day_D16", day_filled_by_system=True)
        return out
    day_first = _make(dt.year, dt.second, dt.first)
    month_first = _make(dt.year, dt.first, dt.second)
    own = dt.evidence()
    if dt.first == dt.second:
        chosen, out["how"] = day_first, "same_either_way"
    elif own == "day_first":
        chosen, out["how"] = day_first, "unambiguous"
    elif own == "month_first":
        chosen, out["how"] = month_first, "unambiguous"
    elif dt.first > 12 and dt.second > 12:
        chosen, out["how"] = None, "not_a_date"
    else:
        out["candidates"] = [d.isoformat() for d in (day_first, month_first) if d]
        if settled == "day_first":
            chosen, out["how"] = day_first, f"inferred_day_first_from_lines:{settled_from}"
        elif settled == "month_first":
            chosen, out["how"] = month_first, f"inferred_month_first_from_lines:{settled_from}"
        else:
            out["ambiguous"] = True
            out["how"] = "lines_disagree" if settled == "disagree" else "no_line_to_infer_from"
            return out
    if chosen is None:
        out["how"] = "not_a_date"
        return out
    out["value"] = chosen.isoformat()
    return out


def _settle(dates: list[tuple[int, _DateText]]) -> tuple[str | None, list[int]]:
    """What the unambiguous dates among `dates` say about the order."""
    seen = {(line_no, dt.evidence()) for line_no, dt in dates if dt.evidence()}
    orders = {order for _, order in seen}
    lines = sorted(line_no for line_no, _ in seen)
    if not orders:
        return None, []
    if len(orders) > 1:
        return "disagree", lines
    return orders.pop(), lines


# --- the whole document ----------------------------------------------------

def _flag(flags: list[dict[str, str]], field: str, why: str) -> None:
    if {"field": field, "why": why} not in flags:
        flags.append({"field": field, "why": why})


def threshold(name: str) -> float:
    """D57: below this, a person must touch the field before going on."""
    return LOW_CONFIDENCE_STRICT if name in STRICT_FIELDS else LOW_CONFIDENCE


def _suggest(doc_date: dict[str, Any], uploaded_on: date | None) -> None:
    """D87: for a header date nothing settles, pre-select the candidate
    closest to the upload day that is not after it. Never chosen silently:
    it is marked as a suggestion and the date stays a field to confirm."""
    doc_date["suggested"] = None
    if not doc_date["ambiguous"] or uploaded_on is None:
        return
    past = [c for c in doc_date["candidates"] if date.fromisoformat(c) <= uploaded_on]
    if past:
        doc_date["suggested"] = max(past)
        doc_date["suggested_why"] = "closest_to_upload_day_not_after_it"


def _field_flags(flags: list[dict[str, str]], name: str, field: FieldValue) -> None:
    if field.state == "unreadable":
        _flag(flags, name, "unreadable")
    elif field.state == "read" and field.confidence is not None and field.confidence < threshold(name):
        _flag(flags, name, "low_confidence")


def _name(line: Line, by_no: dict[int, Line], flags: list[dict[str, str]]) -> tuple[str | None, int | None]:
    repeat = line.repeat
    if repeat.present:
        source = by_no.get(repeat.from_line) if repeat.from_line is not None else None
        verified = source is not None and source.line_no < line.line_no and source.name.state == "read"
        if repeat.sure and repeat.derived_name and verified:
            # Chat A 6.4: a carried name is shown as carried and confirmed
            # by a person, however sure the AI was.
            _flag(flags, "name", "carried_from_line")
            return repeat.derived_name, repeat.from_line
        _flag(flags, "name", "repeat_not_sure" if not repeat.sure else "repeat_not_verified")
        return None, repeat.from_line
    if line.name.state == "read" and _REPEAT_LOOK.match(line.name.text or ""):
        # D63: a mark the AI did not report; the name is not the dashes.
        _flag(flags, "name", "looks_like_repeat_mark")
        return None, None
    return (line.name.text if line.name.state == "read" else None), None


def interpret(answer: InvoiceAnswer, page_count: int, uploaded_on: date | None = None) -> dict[str, Any]:
    by_no = {line.line_no: line for line in answer.lines}
    mfg_texts = [(line.line_no, _DateText(line.mfg, in_header=False)) for line in answer.lines]
    exp_texts = [(line.line_no, _DateText(line.exp, in_header=False)) for line in answer.lines]
    mfg_order = _settle(mfg_texts)
    exp_order = _settle(exp_texts)
    # D87: header dates settle only from other header dates — the document
    # date from the due date and the due date from the document date (both
    # printed by the supplier's system), never from MFG/EXP.
    doc_text = _DateText(answer.doc_date, in_header=True)
    due_text = _DateText(answer.due_date, in_header=True)
    doc_date = _decide(doc_text, *_settle([(0, due_text)]))
    due_date = _decide(due_text, *_settle([(0, doc_text)]))
    _suggest(doc_date, uploaded_on)
    due_date["suggested"] = None
    header_flags: list[dict[str, str]] = []
    for name in ("supplier_name", "supplier_tax_id", "invoice_no", "doc_date", "due_date"):
        _field_flags(header_flags, name, getattr(answer, name))
    for name, decided in (("doc_date", doc_date), ("due_date", due_date)):
        if decided["ambiguous"]:
            _flag(header_flags, name, "ambiguous_date")
        elif decided["how"] in ("not_a_date", "era_unknown"):
            _flag(header_flags, name, decided["how"])

    lines: list[dict[str, Any]] = []
    for (line, (_, mfg_text), (_, exp_text)) in zip(answer.lines, mfg_texts, exp_texts):
        flags: list[dict[str, str]] = []
        for name in ("name", "quantity", "unit", "unit_price", "line_discount", "amount", "lot", "mfg", "exp"):
            _field_flags(flags, name, getattr(line, name))
        name, from_line = _name(line, by_no, flags)

        quantity = count(line.quantity.text) if line.quantity.state == "read" else None
        unit = line.unit.text if line.unit.state == "read" else None
        unit_from_quantity = False
        if line.quantity.state == "read" and quantity is None:
            both = _COUNT_AND_UNIT.match((line.quantity.text or "").strip())
            if both:
                quantity = count(both.group(1))
                if line.unit.state == "absent":
                    unit, unit_from_quantity = both.group(2).strip(), True
                elif unit is None or unit.strip() != both.group(2).strip():
                    _flag(flags, "unit", "unit_written_twice_differently")
        if line.quantity.state == "read" and not quantity:
            _flag(flags, "quantity", "not_a_count")
        money = {}
        for field in ("unit_price", "line_discount", "amount"):
            value = getattr(line, field)
            money[field] = money_satang(value.text) if value.state == "read" else None
            if value.state == "read" and money[field] is None:
                _flag(flags, field, "not_money")

        price_absent = line.unit_price.state == "absent" and line.amount.state == "absent"
        free = bool(quantity) and price_absent
        if quantity and not free and money["unit_price"] is None and money["amount"] is None \
                and "unreadable" in (line.unit_price.state, line.amount.state):
            _flag(flags, "unit_price", "price_unreadable_not_free")

        mfg = _decide(mfg_text, *mfg_order)
        exp = _decide(exp_text, *exp_order)
        for field, decided in (("mfg", mfg), ("exp", exp)):
            if decided["ambiguous"]:
                _flag(flags, field, "ambiguous_date")
            elif decided["how"] in ("not_a_date", "era_unknown"):
                _flag(flags, field, decided["how"])
        if mfg["value"] and exp["value"] and exp["value"] <= mfg["value"]:
            _flag(flags, "exp", "exp_not_after_mfg")
        if exp["value"] and doc_date["value"] and exp["value"] < doc_date["value"]:
            _flag(flags, "exp", "expired_before_document_date")

        lines.append({
            "line_no": line.line_no, "page_no": line.page_no, "name": name, "name_from_line": from_line,
            "free_goods": free, "quantity": quantity,
            "unit": unit, "unit_from_quantity_text": unit_from_quantity,
            "unit_price_satang": money["unit_price"], "line_discount_satang": money["line_discount"],
            "amount_satang": money["amount"],
            "lot": line.lot.text if line.lot.state == "read" else None,
            "lot_state": line.lot.state, "mfg": mfg, "exp": exp, "flags": flags,
        })

    checks, skipped, totals = _check_totals(answer, lines)
    warnings = []
    if answer.totals.boxes and answer.totals.page_no is not None and answer.totals.page_no != page_count:
        warnings.append({"why": "totals_not_on_last_page", "page_no": answer.totals.page_no})
    if not answer.totals.boxes:
        warnings.append({"why": "no_totals_on_paper"})
    pages_with_lines = {line.page_no for line in answer.lines}
    for page_no in range(1, page_count + 1):
        if page_no not in pages_with_lines and page_no != answer.totals.page_no:
            warnings.append({"why": "page_without_lines_or_totals", "page_no": page_no})

    return {
        "doc_date": doc_date,
        "due_date": due_date,
        "header_flags": header_flags,
        "lines": lines,
        "totals": totals,
        "checks": checks,
        "skipped_checks": skipped,
        "warnings": warnings,
        "tolerance_satang": TOLERANCE_SATANG,
        "guessed_values": {"tolerance_satang": TOLERANCE_SATANG, "low_confidence": LOW_CONFIDENCE,
                           "low_confidence_strict": LOW_CONFIDENCE_STRICT},
        "must_check": must_check(header_flags, lines, totals),
    }


def must_check(header_flags, lines, totals) -> list[str]:
    """Every field a person must touch before going on (D57 · D85 · D87):
    each flag of each field, as a path the review page and the server share."""
    paths = [f"header.{flag['field']}" for flag in header_flags]
    for entry in lines:
        paths.extend(f"lines.{entry['line_no']}.{flag['field']}" for flag in entry["flags"])
    paths.extend(f"totals.boxes.{flag['box']}" for flag in totals["flags"])
    return sorted(set(paths), key=paths.index)


def _role(label: str) -> str | None:
    words = re.sub(r"\s+", "", label).rstrip(":")
    if words in LABEL_ROLES:
        return LABEL_ROLES[words]
    if words.startswith("ภาษีมูลค่าเพิ่ม") or words.upper().startswith("VAT"):
        return "vat"
    return None


def _check_totals(answer: InvoiceAnswer, lines: list[dict[str, Any]]):
    roles: dict[str, int | None] = {}
    unknown: list[str] = []
    doubled: list[str] = []
    for box in answer.totals.boxes:
        role = _role(box.label)
        if role is None:
            unknown.append(box.label)
            continue
        if role in roles:
            doubled.append(role)
        roles[role] = money_satang(box.amount.text) if box.amount.state == "read" else None
    for role in doubled:
        roles.pop(role, None)   # two boxes claim the same part: use neither
    known = {role: value for role, value in roles.items() if value is not None}

    checks: list[dict[str, Any]] = []
    skipped: list[dict[str, Any]] = []

    def compare(rule: str, expected: int, printed: int, **extra) -> None:
        checks.append({"rule": rule, "ok": abs(expected - printed) <= TOLERANCE_SATANG,
                       "expected_satang": expected, "printed_satang": printed, **extra})

    paid = [line for line in lines if not line["free_goods"]]
    for line in paid:
        if line["quantity"] and line["unit_price_satang"] is not None and line["amount_satang"] is not None:
            discount_state = answer.lines[line["line_no"] - 1].line_discount.state
            if discount_state == "absent" or line["line_discount_satang"] is not None:
                compare("line_amount", line["quantity"] * line["unit_price_satang"]
                        - (line["line_discount_satang"] or 0), line["amount_satang"], line_no=line["line_no"])
            else:
                skipped.append({"rule": "line_amount", "line_no": line["line_no"], "why": "line_discount_not_money"})
        else:
            skipped.append({"rule": "line_amount", "line_no": line["line_no"], "why": "a_value_is_missing"})

    def needs(rule: str, *wanted: str) -> bool:
        missing = [role for role in wanted if role not in known]
        if missing:
            skipped.append({"rule": rule, "why": "not_on_paper_or_not_readable", "missing": missing})
            return False
        return True

    if needs("lines_add_up_to_gross", "gross"):
        if paid and all(line["amount_satang"] is not None for line in paid):
            compare("lines_add_up_to_gross", sum(line["amount_satang"] for line in paid), known["gross"])
        else:
            skipped.append({"rule": "lines_add_up_to_gross", "why": "a_line_amount_is_missing"})
    if needs("gross_minus_discount_is_net", "gross", "discount", "net"):
        compare("gross_minus_discount_is_net", known["gross"] - known["discount"], known["net"])
    if needs("net_over_vat_rate_is_base", "net", "base_before_vat"):
        base = int((Decimal(known["net"]) / VAT_RATE).quantize(Decimal("1"), rounding=ROUND_HALF_UP))
        compare("net_over_vat_rate_is_base", base, known["base_before_vat"])
    if needs("base_plus_vat_is_net", "base_before_vat", "vat", "net"):
        compare("base_plus_vat_is_net", known["base_before_vat"] + known["vat"], known["net"])

    box_flags: list[dict[str, str]] = []
    for index, box in enumerate(answer.totals.boxes):
        mine: list[dict[str, str]] = []
        _field_flags(mine, "total_amount", box.amount)
        if box.amount.state == "read" and money_satang(box.amount.text) is None:
            _flag(mine, "total_amount", "not_money")
        box_flags.extend({"box": index, "why": flag["why"]} for flag in mine)
    totals = {"roles": known, "unknown_labels": unknown, "labels_used_twice": sorted(set(doubled)),
              "flags": box_flags}
    return checks, skipped, totals
