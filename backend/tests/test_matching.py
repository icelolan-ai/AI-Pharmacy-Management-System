"""The matching rules (6.5 · app/scan/matching.py), called as they are (D43-a)."""

from datetime import datetime

import pytest

from app.scan.matching import (
    MIN_NAME_SIMILARITY, Remembered, conflicts, form_of, normalise, propose_medicines, propose_suppliers, strengths,
)


def med(id_, name, strength=None, form=None, unit="กล่อง", active=True, generic=None, ingredient=None):
    return {"id": id_, "name": name, "strength": strength, "dosage_form": form, "unit": unit,
            "is_active": active, "generic_name": generic, "active_ingredient": ingredient}


# --- one form for names (Chat A: used to remember AND to look up) -------------

@pytest.mark.parametrize("a,b", [
    ("Paracetamol 500mg", "paracetamol 500 mg"),
    ("พาราเซตามอล 500 มก.", "พาราเซตามอล500มก"),
    ("พาราเซตามอล ๕๐๐ มก.", "พาราเซตามอล 500 mg"),
    ("Syrup 60 cc", "syrup 60ml"),
    ("ยาแก้ไอ (ขวดใหญ่)", "ยาแก้ไอ ขวดใหญ่"),
])
def test_names_that_differ_only_in_spacing_case_digits_or_unit_spelling_are_one(a, b):
    assert normalise(a) == normalise(b)


def test_different_strengths_stay_different_names():
    assert normalise("Paracetamol 500mg") != normalise("Paracetamol 250mg")


# --- strength, by kind (Chat A ข.) --------------------------------------------------

@pytest.mark.parametrize("text,kind,value", [
    ("พาราเซตามอล 500 มก.", "weight", "500 mg"), ("Paracetamol 0.5 g", "weight", "500 mg"),
    ("Vit B12 1000 mcg", "weight", "1 mg"), ("Betamethasone 0.1% cream", "percent", "0.1%"),
    ("Amoxy syrup 125mg/5ml", "concentration", "125mg/5ml"),
])
def test_strengths_are_read_by_kind(text, kind, value):
    assert value in strengths(text)[kind]


def test_a_volume_alone_is_the_bottle_not_the_strength():
    assert strengths("ยาแก้ไอน้ำดำ 60cc") == {}


def test_500_against_250_is_a_contradiction_with_both_values():
    found = conflicts("พาราเซตามอล 500 มก.", None, med("1", "Paracetamol", "250 mg"))
    assert [(c.what, c.paper, c.system) for c in found] == [("strength", "500 mg", "250 mg")]


@pytest.mark.parametrize("paper,system", [
    ("พาราเซตามอล", "250 mg"),              # nothing read on the paper
    ("พาราเซตามอล 500 มก.", None),          # nothing in the system
    ("Betamethasone 0.1% cream 5 g", "0.1%"),  # the tube size is not compared with a percent
    ("Paracetamol 0.5 g", "500 mg"),
])
def test_unreadable_or_unshared_strength_is_not_a_contradiction(paper, system):
    assert not [c for c in conflicts(paper, None, med("1", "x", system)) if c.what == "strength"]


def test_tablet_against_capsule_is_a_contradiction():
    found = conflicts("Amoxicillin 500mg cap", None, med("1", "Amoxicillin", "500 mg", "เม็ด"))
    assert [(c.what, c.paper, c.system) for c in found] == [("form", "capsule", "tablet")]


def test_forms_are_read_from_thai_and_english_words():
    assert form_of("ยาแก้ไอน้ำดำ") == "liquid" and form_of("Amoxy 500 caps") == "capsule"
    assert form_of("พาราเซตามอล 500") is None


# --- proposals (D52 · Chat A ข.) ----------------------------------------------------

MEDS = [
    med("p500", "พาราเซตามอล 500 มก.", "500 mg", "เม็ด"),
    med("p250", "พาราเซตามอล 250 มก.", "250 mg", "เม็ด"),
    med("pcap", "พาราเซตามอล 500 มก. แคปซูล", "500 mg", "แคปซูล"),
    med("ibu", "ไอบูโปรเฟน 400 มก.", "400 mg", "เม็ด"),
    med("p500b", "พาราเซตามอล 500 มก. (ยี่ห้อ ข)", "500 mg", "เม็ด"),
    med("p500c", "พาราเซตามอล 500 มก. (ยี่ห้อ ค)", "500 mg", "เม็ด"),
    med("off", "พาราเซตามอล 500 มก. เก่า", "500 mg", "เม็ด", active=False),
]


def test_a_contradicting_strength_is_never_proposed_however_similar_the_name():
    proposals, _ = propose_medicines("พาราเซตามอล 500 มก. 10x10 เม็ด", "กล่อง", MEDS, None)
    ids = [p.id for p in proposals]
    assert "p250" not in ids and "pcap" not in ids
    assert ids and ids[0] in ("p500", "p500b", "p500c")


def test_at_most_three_and_never_a_switched_off_medicine():
    proposals, _ = propose_medicines("พาราเซตามอล 500 มก.", None, MEDS, None)
    assert len(proposals) <= 3 and "off" not in [p.id for p in proposals]


def test_each_proposal_says_why_in_words():
    proposals, _ = propose_medicines("พาราเซตามอล 500 มก.", "กล่อง", MEDS, None)
    reasons = " ".join(proposals[0].reasons)
    assert "ชื่อคล้ายกัน" in reasons and "ความแรงตรงกัน 500 mg" in reasons and "หน่วยตรงกัน: กล่อง" in reasons


def test_no_strength_read_earns_no_strength_points():
    proposals, _ = propose_medicines("พาราเซตามอล", None, MEDS, None)
    assert all("ความแรง" not in " ".join(p.reasons) for p in proposals)


def test_a_name_too_far_is_not_proposed():
    proposals, _ = propose_medicines("ยาธาตุน้ำแดง", None, MEDS, None)
    assert proposals == []
    assert MIN_NAME_SIMILARITY == 0.35   # a guess (D72), pinned until 6.7


# --- memory (Chat A, after the draft) --------------------------------------------------

def test_memory_comes_first_and_says_where_it_came_from():
    memory = Remembered("p500c", datetime(2026, 11, 20, 10, 0), "FAKE-0001")
    proposals, _ = propose_medicines("พาราเซตามอล 500 มก.", None, MEDS, memory)
    assert proposals[0].id == "p500c" and proposals[0].from_memory
    assert proposals[0].reasons == ["เคยเลือกตัวนี้เมื่อ 20/11/2569 จากใบ FAKE-0001"]


def test_a_remembered_medicine_that_was_switched_off_is_not_proposed_and_says_so():
    proposals, note = propose_medicines("พาราเซตามอล 500 มก.", None, MEDS, Remembered("off", datetime(2026, 11, 1), None))
    assert "off" not in [p.id for p in proposals] and note == "ยาที่เคยเลือกไว้ถูกปิดใช้แล้ว จึงไม่เสนอ"


def test_a_remembered_medicine_that_now_contradicts_the_paper_is_not_proposed():
    proposals, _ = propose_medicines("พาราเซตามอล 500 มก.", None, MEDS, Remembered("p250", datetime(2026, 11, 1), "X"))
    assert "p250" not in [p.id for p in proposals]


def test_suppliers_follow_the_same_rule():
    suppliers = [{"id": "s1", "name": "บริษัท ปลอมเพื่อทดสอบ ฟาร์มา จำกัด"}, {"id": "s2", "name": "ร้านอื่น"}]
    proposals = propose_suppliers("บริษัท ปลอมเพื่อทดสอบ ฟาร์มา จำกัด (FAKE)", suppliers, None)
    assert proposals[0].id == "s1" and "ชื่อคล้ายกัน" in proposals[0].reasons[0]
    remembered = propose_suppliers("ชื่ออะไรก็ได้", suppliers, Remembered("s2", datetime(2026, 11, 2), "0042"))
    assert remembered[0].id == "s2" and remembered[0].from_memory
