"""Which medicine — and which supplier — an invoice line means (6.5).

Code only (Chat A ก.): free, testable, and the shop's medicine list never
leaves the system. Whether AI helps is decided after real invoices (6.7).

The system proposes, a person chooses — always, even for the top score
(D52). At most 3 proposals, each with its reasons in words.

🔴 Strength and dosage form (Chat A ข.): a candidate whose strength or form
CONTRADICTS the paper is never proposed — 500 mg for 250 mg is the most
dangerous mistake a pharmacy can make. A person who picks one anyway, by
searching, is shown both values and must confirm again (`conflicts`).
If either side's strength cannot be read, it is not a contradiction — and
it earns nothing either.

Memory (Chat A, after the draft): what a person chose before, for the same
name from the same supplier, comes first, with where it came from ("เคย
เลือกตัวนี้เมื่อ <วันที่> จากใบ <เลขใบ>") — and is still only a proposal. A
later different choice wins. Names are put in one form before they are
remembered or compared (`normalise`), in this one place.
"""

import re
from dataclasses import dataclass, field
from datetime import datetime
from typing import Any

# D72: guessed, review with real invoices in 6.7 (Chat A ค.).
MIN_NAME_SIMILARITY = 0.35   # below this a medicine is not proposed on its name
MIN_SUPPLIER_SIMILARITY = 0.40
TOP = 3

_THAI_DIGITS = str.maketrans("๐๑๒๓๔๕๖๗๘๙", "0123456789")
# Units written many ways -> one. Longest first, so "มก." is not read as "ก.".
_UNITS = [
    ("มิลลิกรัม", "mg"), ("มก.", "mg"), ("มก", "mg"), ("mg.", "mg"), ("mg", "mg"),
    ("ไมโครกรัม", "mcg"), ("มคก.", "mcg"), ("mcg", "mcg"), ("µg", "mcg"),
    ("มิลลิลิตร", "ml"), ("มล.", "ml"), ("มล", "ml"), ("ml.", "ml"), ("ml", "ml"), ("ซีซี", "ml"), ("cc", "ml"),
    ("กรัม", "g"), ("g.", "g"), ("gm", "g"), ("g", "g"),
    ("%", "%"),
]
_UNIT_WORDS = "|".join(re.escape(u) for u, _ in _UNITS)
_STRENGTH = re.compile(r"(\d+(?:\.\d+)?)\s*(" + _UNIT_WORDS + r")(?![a-z])", re.I)
_RATIO = re.compile(r"(\d+(?:\.\d+)?)\s*(" + _UNIT_WORDS + r")\s*/\s*(\d+(?:\.\d+)?)\s*(" + _UNIT_WORDS + r")(?![a-z])", re.I)
_TO_MG = {"mg": 1.0, "mcg": 0.001, "g": 1000.0}
# Dosage forms: words on the paper -> one kind. Unknown stays unknown.
_FORMS = {
    "tablet": ("เม็ด", "tablet", "tab", "tabs"),
    "capsule": ("แคปซูล", "capsule", "cap", "caps"),
    "liquid": ("น้ำ", "ไซรัป", "syrup", "suspension", "solution", "ยาน้ำ"),
    "cream": ("ครีม", "cream", "ointment", "ขี้ผึ้ง", "เจล", "gel"),
    "powder": ("ผง", "powder", "ซอง", "sachet"),
    "injection": ("ฉีด", "injection", "inj", "amp", "แอมพูล", "vial"),
    "drops": ("หยด", "drop", "drops"),
}


def normalise(text: str | None) -> str:
    """One form for a name, used to remember it and to compare it:
    lower case, Thai digits as 0-9, units in one spelling, no spaces or
    punctuation. "Paracetamol 500 MG." and "paracetamol500mg" are equal."""
    if not text:
        return ""
    value = text.translate(_THAI_DIGITS).lower()
    for written, unit in _UNITS:
        value = value.replace(written.lower(), unit)
    return re.sub(r"[\s.,;:()\[\]/\\\-_'\"“”]+", "", value)


def _unit(written: str) -> str:
    return next(u for w, u in _UNITS if w.lower() == written.lower())


def _num(value: float) -> str:
    return f"{value:g}"


def strengths(text: str | None) -> dict[str, frozenset[str]]:
    """The strengths written in the text, by kind — compared only kind with
    kind, and only kinds both sides have:
      weight         mg · mcg · g, all as mg       ("500 มก." -> {"500 mg"})
      percent        %                             ("0.1%")
      concentration  weight per volume             ("120mg/5ml")
    A volume alone (60 ml, 60cc) is the bottle, not the strength: not kept.
    Empty = no strength read."""
    if not text:
        return {}
    value = text.translate(_THAI_DIGITS).lower()
    found: dict[str, set[str]] = {}
    for a, ua, b, ub in _RATIO.findall(value):
        found.setdefault("concentration", set()).add(f"{_num(float(a))}{_unit(ua)}/{_num(float(b))}{_unit(ub)}")
    value = _RATIO.sub(" ", value)
    for number, written in _STRENGTH.findall(value):
        unit = _unit(written)
        if unit in _TO_MG:
            found.setdefault("weight", set()).add(f"{_num(float(number) * _TO_MG[unit])} mg")
        elif unit == "%":
            found.setdefault("percent", set()).add(f"{_num(float(number))}%")
    return {kind: frozenset(values) for kind, values in found.items()}


def form_of(*texts: str | None) -> str | None:
    """The dosage form the words say, or None when they say none (or two)."""
    words = " ".join(t for t in texts if t).lower()
    kinds = {kind for kind, keys in _FORMS.items()
             if any(re.search(rf"(?<![a-z]){re.escape(key)}(?![a-z])", words) for key in keys)}
    return kinds.pop() if len(kinds) == 1 else None


def _grams(text: str) -> set[str]:
    padded = f"  {text} "
    return {padded[i:i + 3] for i in range(len(padded) - 2)}


def similarity(a: str | None, b: str | None) -> float:
    """Shared three-letter pieces of the two normalised names, 0..1."""
    left, right = _grams(normalise(a)), _grams(normalise(b))
    if not normalise(a) or not normalise(b):
        return 0.0
    return len(left & right) / len(left | right)


@dataclass
class Conflict:
    what: str            # "strength" | "form"
    paper: str
    system: str


def conflicts(line_name: str, line_unit: str | None, medicine: dict[str, Any]) -> list[Conflict]:
    """Where a medicine contradicts the paper. Unreadable on either side is
    not a contradiction (Chat A ข.)."""
    found: list[Conflict] = []
    paper_strength = strengths(line_name)
    system_strength = strengths(medicine.get("strength")) or strengths(medicine.get("name"))
    for kind in sorted(paper_strength.keys() & system_strength.keys()):
        if paper_strength[kind] != system_strength[kind]:
            found.append(Conflict("strength", _show(paper_strength[kind]), _show(system_strength[kind])))
    paper_form = form_of(line_name)
    system_form = form_of(medicine.get("dosage_form"), medicine.get("name"))
    if paper_form and system_form and paper_form != system_form:
        found.append(Conflict("form", paper_form, system_form))
    return found


def _show(values: frozenset[str]) -> str:
    return " + ".join(sorted(values))


def strength_agrees(line_name: str, medicine: dict[str, Any]) -> str | None:
    """The strength both sides read the same, for a reason — or None when
    nothing is shared (no points for strength then, Chat A ข.)."""
    paper = strengths(line_name)
    system = strengths(medicine.get("strength")) or strengths(medicine.get("name"))
    shared = sorted(paper.keys() & system.keys())
    if shared and all(paper[kind] == system[kind] for kind in shared):
        return " · ".join(_show(paper[kind]) for kind in shared)
    return None


@dataclass
class Remembered:
    target_id: str
    chosen_at: datetime
    invoice_no: str | None


@dataclass
class Proposal:
    id: str
    name: str
    score: int
    reasons: list[str] = field(default_factory=list)
    from_memory: bool = False


def _remembered_reason(memory: Remembered) -> str:
    when = memory.chosen_at.strftime("%d/%m/") + str(memory.chosen_at.year + 543)
    source = f"จากใบ {memory.invoice_no}" if memory.invoice_no else "จากใบที่ไม่มีเลขที่"
    return f"เคยเลือกตัวนี้เมื่อ {when} {source}"


def propose_medicines(line_name: str, line_unit: str | None, medicines: list[dict[str, Any]],
                      memory: Remembered | None) -> tuple[list[Proposal], str | None]:
    """At most 3 proposals, best first, and a note when memory could not be
    used (the remembered medicine was switched off)."""
    by_id = {str(m["id"]): m for m in medicines}
    proposals: list[Proposal] = []
    note = None
    if memory is not None:
        remembered = by_id.get(memory.target_id)
        if remembered is None or not remembered.get("is_active", True):
            note = "ยาที่เคยเลือกไว้ถูกปิดใช้แล้ว จึงไม่เสนอ"
        elif not conflicts(line_name, line_unit, remembered):
            proposals.append(Proposal(memory.target_id, remembered["name"], 100,
                                      [_remembered_reason(memory)], from_memory=True))
    paper_form = form_of(line_name)
    scored: list[Proposal] = []
    for medicine in medicines:
        if not medicine.get("is_active", True) or any(p.id == str(medicine["id"]) for p in proposals):
            continue
        if conflicts(line_name, line_unit, medicine):
            continue   # 🔴 never proposed (Chat A ข.)
        names = [medicine.get("name"), medicine.get("generic_name"), medicine.get("active_ingredient")]
        best = max(similarity(line_name, name) for name in names)
        if best < MIN_NAME_SIMILARITY:
            continue
        reasons = [f"ชื่อคล้ายกัน {round(best * 100)}%"]
        score = round(best * 70)
        agreed = strength_agrees(line_name, medicine)
        if agreed:
            score += 20
            reasons.append(f"ความแรงตรงกัน {agreed}")
        system_form = form_of(medicine.get("dosage_form"), medicine.get("name"))
        if paper_form and paper_form == system_form:
            score += 5
            reasons.append("รูปแบบยาตรงกัน")
        if line_unit and medicine.get("unit") and line_unit.strip() == str(medicine["unit"]).strip():
            score += 5
            reasons.append(f"หน่วยตรงกัน: {line_unit.strip()}")
        scored.append(Proposal(str(medicine["id"]), medicine["name"], min(score, 99), reasons))
    scored.sort(key=lambda p: (-p.score, p.name))
    return (proposals + scored)[:TOP], note


def propose_suppliers(invoice_name: str | None, suppliers: list[dict[str, Any]],
                      memory: Remembered | None) -> list[Proposal]:
    """The same rule for the supplier (Chat A ง.): memory first, then names."""
    by_id = {str(s["id"]): s for s in suppliers}
    proposals: list[Proposal] = []
    if memory is not None and memory.target_id in by_id:
        proposals.append(Proposal(memory.target_id, by_id[memory.target_id]["name"], 100,
                                  [_remembered_reason(memory)], from_memory=True))
    scored = []
    for supplier in suppliers:
        if any(p.id == str(supplier["id"]) for p in proposals):
            continue
        score = similarity(invoice_name, supplier["name"])
        if score >= MIN_SUPPLIER_SIMILARITY:
            scored.append(Proposal(str(supplier["id"]), supplier["name"], round(score * 99),
                                   [f"ชื่อคล้ายกัน {round(score * 100)}%"]))
    scored.sort(key=lambda p: (-p.score, p.name))
    return (proposals + scored)[:TOP]
