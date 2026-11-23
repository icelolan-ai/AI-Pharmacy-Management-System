"""What our code makes of the AI's text (6.3 · D84 · docs/06-ai-design.md 3.3–3.6).

Each rule is called as it is, on the fake invoices' own answers, and each
case has a twin where the answer differs by one thing (D74: the two ways of
deciding must give different results somewhere, or the test proves nothing).
"""

import pytest

from app.scan.invoice_answer import InvoiceAnswer
from datetime import date

from app.scan.invoice_reading import (
    LOW_CONFIDENCE, LOW_CONFIDENCE_STRICT, TOLERANCE_SATANG, count, interpret, money_satang,
)
from tests.fake_invoice_answers import answer_for, changed, read


def run(answer: dict, pages: int = 2, uploaded_on=None) -> dict:
    return interpret(InvoiceAnswer.model_validate(answer), pages, uploaded_on)


def line(result: dict, line_no: int) -> dict:
    return next(entry for entry in result["lines"] if entry["line_no"] == line_no)


def flags(entry: dict) -> set[tuple[str, str]]:
    return {(flag["field"], flag["why"]) for flag in entry["flags"]}


# --- money and counts --------------------------------------------------------

@pytest.mark.parametrize("text,satang", [("1,036.00", 103600), ("35.00", 3500), ("4", 400), ("934.5", 93450),
                                         ("1,000", 100000), ("0.07", 7)])
def test_money_as_printed(text, satang):
    assert money_satang(text) == satang


@pytest.mark.parametrize("text", ["1.250,00", "12,50", "35.000", "-5.00", "฿35", "3 5.00", "", "แถม", "1,0000"])
def test_anything_not_plainly_money_is_not_guessed(text):
    assert money_satang(text) is None


@pytest.mark.parametrize("text,value", [("10", 10), ("1,200", 1200)])
def test_counts(text, value):
    assert count(text) == value


def test_a_count_and_unit_in_one_column_are_split():
    """The handwritten fake writes '5 กล่อง' in one column."""
    result = run(answer_for("fake-b"), 1)
    assert (line(result, 1)["quantity"], line(result, 1)["unit"]) == (5, "กล่อง")
    assert line(result, 1)["unit_from_quantity_text"] is True


def test_a_unit_written_twice_differently_goes_to_a_person():
    answer = changed("fake-b", lambda a: a["lines"][0].update(unit=read("ขวด")))
    assert ("unit", "unit_written_twice_differently") in flags(line(run(answer, 1), 1))


def test_a_quantity_that_is_not_a_count_goes_to_a_person():
    answer = changed("fake-a", lambda a: a["lines"][0].update(quantity=read("สิบ")))
    entry = line(run(answer), 1)
    assert entry["quantity"] is None and ("quantity", "not_a_count") in flags(entry)


# --- free goods (D59 · D62) ---------------------------------------------------

def test_free_goods_are_a_quantity_with_price_and_amount_absent():
    result = run(answer_for("fake-a"))
    assert [entry["free_goods"] for entry in result["lines"]] == [False, True, False, False, False, True]


def test_an_unreadable_price_is_not_free_and_goes_to_a_person():
    """D62: unreadable is not absent. Twin of the free line 2."""
    answer = changed("fake-a", lambda a: a["lines"][1].update(
        unit_price={"state": "unreadable", "text": None, "confidence": 0.2}))
    entry = line(run(answer), 2)
    assert entry["free_goods"] is False
    assert ("unit_price", "price_unreadable_not_free") in flags(entry)


def test_the_word_แถม_alone_does_not_make_a_line_free():
    answer = changed("fake-a", lambda a: a["lines"][0].update(remark=read("แถม")))
    assert line(run(answer), 1)["free_goods"] is False


# --- repeat marks (D63) -------------------------------------------------------

def test_a_sure_repeat_carries_the_name_from_its_line():
    result = run(answer_for("fake-a"))
    entry = line(result, 4)
    assert (entry["name"], entry["name_from_line"]) == ("ยาแก้ไอน้ำดำ 180cc", 3)
    # ...and a person confirms it once (Chat A 6.4).
    assert ("name", "carried_from_line") in flags(entry) and "lines.4.name" in result["must_check"]


def test_an_unsure_repeat_leaves_the_name_to_a_person():
    answer = changed("fake-a", lambda a: a["lines"][3].update(
        repeat={"present": True, "from_line": 3, "derived_name": None, "sure": False}))
    entry = line(run(answer), 4)
    assert entry["name"] is None and ("name", "repeat_not_sure") in flags(entry)


def test_a_repeat_from_a_line_without_a_name_is_not_trusted():
    def change(a):
        a["lines"][2]["name"] = {"state": "unreadable", "text": None, "confidence": 0.1}
    entry = line(run(changed("fake-a", change)), 4)
    assert entry["name"] is None and ("name", "repeat_not_verified") in flags(entry)


def test_a_repeat_mark_the_ai_missed_is_caught():
    """Seen in the first real call (22 Nov): the AI copied '------ 180cc'
    without reporting a repeat. The dashes are never a product name."""
    answer = changed("fake-a", lambda a: a["lines"][3].update(
        repeat={"present": False, "from_line": None, "derived_name": None, "sure": False}))
    entry = line(run(answer), 4)
    assert entry["name"] is None and ("name", "looks_like_repeat_mark") in flags(entry)


# --- dates (D64 · D16) --------------------------------------------------------

def test_header_year_in_พศ_and_line_years_in_คศ():
    result = run(answer_for("fake-a"))
    assert result["doc_date"]["candidates"] == ["2026-09-04", "2026-04-09"]
    assert line(result, 1)["mfg"]["value"] == "2024-01-15"
    assert line(result, 1)["exp"]["value"] == "2027-01-14"


def test_an_ambiguous_date_is_settled_by_unambiguous_lines_of_the_same_field():
    entry = line(run(answer_for("fake-a")), 3)
    assert entry["exp"]["value"] == "2028-06-05"
    assert entry["exp"]["how"].startswith("inferred_day_first_from_lines")
    assert entry["exp"]["candidates"] == ["2028-06-05", "2028-05-06"]


def test_with_no_line_to_settle_it_a_person_decides():
    """Twin of the case above: the same '05.06.28', but every other EXP
    on the paper is ambiguous too."""
    def change(a):
        for index, text in ((0, "04.01.27"), (1, "04.01.27"), (4, "09.02.27"), (5, "09.02.27")):
            a["lines"][index]["exp"] = read(text)
    entry = line(run(changed("fake-a", change)), 3)
    assert entry["exp"]["value"] is None and entry["exp"]["ambiguous"] is True
    assert ("exp", "ambiguous_date") in flags(entry)


def test_lines_that_disagree_settle_nothing():
    answer = changed("fake-a", lambda a: a["lines"][4].update(exp=read("02.19.27")))
    entry = line(run(answer), 3)
    assert entry["exp"]["value"] is None and entry["exp"]["how"] == "lines_disagree"


def test_month_first_is_followed_when_the_lines_say_so():
    def change(a):
        for index, text in ((0, "01.14.27"), (1, "01.14.27"), (4, "02.19.27"), (5, "02.19.27")):
            a["lines"][index]["exp"] = read(text)
    assert line(run(changed("fake-a", change)), 3)["exp"]["value"] == "2028-05-06"


def test_month_and_year_only_is_the_last_day_and_says_so():
    """D16, and Chat A: the review page must show the system chose the day."""
    answer = changed("fake-a", lambda a: a["lines"][0].update(exp=read("02/2028")))
    exp = line(run(answer), 1)["exp"]
    assert exp["value"] == "2028-02-29" and exp["day_filled_by_system"] is True


def test_a_handwritten_header_date_with_nothing_to_settle_it_goes_to_a_person():
    result = run(answer_for("fake-b"), 1)
    assert result["doc_date"]["value"] is None
    assert {"field": "doc_date", "why": "ambiguous_date"} in result["header_flags"]


@pytest.mark.parametrize("text,why", [("31.02.27", "not_a_date"), ("15.13.27", "not_a_date"),
                                      ("1 ม.ค.", "not_a_date")])
def test_impossible_dates_are_not_guessed(text, why):
    entry = line(run(changed("fake-a", lambda a: a["lines"][0].update(exp=read(text)))), 1)
    assert entry["exp"]["value"] is None and ("exp", why) in flags(entry)


def test_a_two_digit_header_year_has_no_era_to_go_by():
    result = run(changed("fake-a", lambda a: a.update(doc_date=read("04/09/69"))))
    assert result["doc_date"]["value"] is None
    assert {"field": "doc_date", "why": "era_unknown"} in result["header_flags"]


def test_lot_and_exp_absent_from_handwritten_paper_are_not_errors():
    """D62: the handwritten note has no LOT/EXP column at all."""
    entry = line(run(answer_for("fake-b"), 1), 1)
    assert entry["lot_state"] == "absent" and entry["exp"]["how"] == "absent"
    assert not {f for f in flags(entry) if f[0] in ("lot", "exp")}


def test_expiry_before_manufacture_is_flagged():
    entry = line(run(changed("fake-a", lambda a: a["lines"][0].update(exp=read("14.01.23")))), 1)
    assert ("exp", "exp_not_after_mfg") in flags(entry)


# --- confidence (D85) ---------------------------------------------------------

def test_low_confidence_adds_a_flag():
    answer = changed("fake-a", lambda a: a["lines"][0].update(lot=read("FK2401", LOW_CONFIDENCE - 0.01)))
    assert ("lot", "low_confidence") in flags(line(run(answer), 1))


def test_high_confidence_never_removes_a_flag():
    """D85: an unreadable field stays flagged however sure the model says it is."""
    answer = changed("fake-a", lambda a: a["lines"][0].update(
        lot={"state": "unreadable", "text": "FK24?1", "confidence": 1.0}))
    assert ("lot", "unreadable") in flags(line(run(answer), 1))


# --- totals (D61) -------------------------------------------------------------

def test_the_fake_invoice_adds_up_on_every_rule():
    result = run(answer_for("fake-a"))
    assert {c["rule"] for c in result["checks"]} == {
        "line_amount", "lines_add_up_to_gross", "gross_minus_discount_is_net",
        "net_over_vat_rate_is_base", "base_plus_vat_is_net"}
    assert all(c["ok"] for c in result["checks"]) and result["skipped_checks"] == []


def test_the_box_after_discount_is_the_base_before_vat_not_gross_minus_discount():
    """D61: 'ยอดเงินหลังหักส่วนลด' printed 934.58 is net ÷ 1.07, not 1,036 − 36.
    Read the label the naive way and the check fails; read it right and it passes."""
    result = run(answer_for("fake-a"))
    base = next(c for c in result["checks"] if c["rule"] == "net_over_vat_rate_is_base")
    assert base["ok"] and base["printed_satang"] == 93458
    assert result["totals"]["roles"]["gross"] - result["totals"]["roles"]["discount"] != base["printed_satang"]


@pytest.mark.parametrize(
    "box,amount,rule",
    [(0, "1,037.00", "lines_add_up_to_gross"), (1, "37.00", "gross_minus_discount_is_net"),
     (2, "934.60", "net_over_vat_rate_is_base"), (3, "65.40", "base_plus_vat_is_net")],
)
def test_a_wrong_box_fails_its_rule(box, amount, rule):
    answer = changed("fake-a", lambda a: a["totals"]["boxes"][box].update(amount=read(amount)))
    failed = {c["rule"] for c in run(answer)["checks"] if not c["ok"]}
    assert rule in failed


def test_one_satang_of_rounding_passes_two_do_not():
    """TOLERANCE_SATANG is a guess (D72); this pins what it lets through."""
    assert TOLERANCE_SATANG == 1
    near = changed("fake-a", lambda a: a["totals"]["boxes"][2].update(amount=read("934.59")))
    far = changed("fake-a", lambda a: a["totals"]["boxes"][2].update(amount=read("934.60")))
    rule = "net_over_vat_rate_is_base"
    assert next(c for c in run(near)["checks"] if c["rule"] == rule)["ok"] is True
    assert next(c for c in run(far)["checks"] if c["rule"] == rule)["ok"] is False


def test_a_wrong_line_amount_fails_on_that_line():
    answer = changed("fake-a", lambda a: a["lines"][2].update(amount=read("226.00")))
    failed = [(c["rule"], c.get("line_no")) for c in run(answer)["checks"] if not c["ok"]]
    assert ("line_amount", 3) in failed


def test_boxes_not_on_the_paper_skip_their_rules_without_warning():
    """The handwritten fake has one total and no VAT: three rules skipped, none failed."""
    result = run(answer_for("fake-b"), 1)
    assert all(c["ok"] for c in result["checks"])
    assert {s["rule"] for s in result["skipped_checks"]} == {
        "gross_minus_discount_is_net", "net_over_vat_rate_is_base", "base_plus_vat_is_net"}


def test_an_unknown_label_is_shown_and_not_used():
    answer = changed("fake-a", lambda a: a["totals"]["boxes"].append(
        {"label": "ค่าขนส่ง", "amount": read("50.00")}))
    result = run(answer)
    assert result["totals"]["unknown_labels"] == ["ค่าขนส่ง"]
    assert all(c["ok"] for c in result["checks"])


def test_two_boxes_with_the_same_part_are_both_left_out():
    answer = changed("fake-a", lambda a: a["totals"]["boxes"].append(
        {"label": "ยอดสุทธิ", "amount": read("999.00")}))
    result = run(answer)
    assert result["totals"]["labels_used_twice"] == ["net"] and "net" not in result["totals"]["roles"]


def test_totals_not_on_the_last_page_are_warned_about():
    answer = changed("fake-a", lambda a: a["totals"].update(page_no=1))
    assert {"why": "totals_not_on_last_page", "page_no": 1} in run(answer)["warnings"]


# --- D87: never across kinds of date -------------------------------------------

def test_the_header_date_is_not_settled_by_mfg_or_exp():
    """Every MFG/EXP on fake A is day-first, and still the header '04/09/2569'
    stays open: it comes from the supplier's system, they from the maker."""
    result = run(answer_for("fake-a"))
    assert result["doc_date"]["value"] is None and result["doc_date"]["ambiguous"] is True
    assert {"field": "doc_date", "why": "ambiguous_date"} in result["header_flags"]


def test_lines_are_still_settled_by_lines_of_the_same_field():
    assert line(run(answer_for("fake-a")), 3)["exp"]["value"] == "2028-06-05"


@pytest.mark.parametrize("uploaded_on,suggested", [
    (date(2026, 9, 10), "2026-09-04"),   # both before the upload: the nearer one
    (date(2026, 5, 1), "2026-04-09"),    # 4 Sep is still in the future: not offered
    (date(2026, 1, 1), None),            # both in the future: nothing offered
])
def test_an_open_header_date_suggests_the_closest_day_not_after_the_upload(uploaded_on, suggested):
    doc_date = run(answer_for("fake-a"), uploaded_on=uploaded_on)["doc_date"]
    assert doc_date["suggested"] == suggested
    assert doc_date["value"] is None, "a suggestion is never the value until a person confirms"


def test_a_suggested_header_date_still_needs_one_confirmation():
    result = run(answer_for("fake-a"), uploaded_on=date(2026, 9, 10))
    assert "header.doc_date" in result["must_check"]


def test_an_unambiguous_header_date_needs_no_suggestion():
    result = run(changed("fake-a", lambda a: a.update(doc_date=read("24/09/2569"))), uploaded_on=date(2026, 9, 30))
    assert result["doc_date"]["value"] == "2026-09-24" and result["doc_date"]["suggested"] is None
    assert "header.doc_date" not in result["must_check"]


# --- D57: two levels -----------------------------------------------------------

@pytest.mark.parametrize("field,confidence,flagged", [
    ("quantity", LOW_CONFIDENCE_STRICT - 0.01, True), ("quantity", LOW_CONFIDENCE_STRICT, False),
    ("unit_price", 0.85, True), ("amount", 0.85, True), ("exp", 0.89, True),
    ("lot", 0.85, False), ("lot", LOW_CONFIDENCE - 0.01, True), ("unit", 0.85, False), ("name", 0.79, True),
])
def test_quantities_money_and_expiry_need_090_the_rest_080(field, confidence, flagged):
    text = answer_for("fake-a")["lines"][0][field]["text"]
    answer = changed("fake-a", lambda a: a["lines"][0].update({field: read(text, confidence)}))
    result = run(answer)
    assert ((field, "low_confidence") in flags(line(result, 1))) is flagged
    assert (f"lines.1.{field}" in result["must_check"]) is flagged


def test_a_total_box_is_money_and_needs_090():
    answer = changed("fake-a", lambda a: a["totals"]["boxes"][4].update(amount=read("1,000.00", 0.85)))
    assert "totals.boxes.4" in run(answer)["must_check"]


# --- D87 with prompt v2: the due date is the other header date ----------------

def test_an_unambiguous_due_date_settles_the_document_date():
    """'04/09/2569' alone is open; a due date '30/09/2569' on the same header
    shows the supplier writes day first."""
    result = run(changed("fake-a", lambda a: a.update(due_date=read("30/09/2569"))), uploaded_on=date(2026, 9, 10))
    assert result["doc_date"]["value"] == "2026-09-04"
    assert result["due_date"]["value"] == "2026-09-30"
    assert "header.doc_date" not in result["must_check"]


def test_a_due_date_never_settles_line_dates_and_lines_never_settle_it():
    def change(a):
        a["due_date"] = read("05/10/2569")
        for line in a["lines"]:
            line["exp"] = read("05.06.28")
    result = run(changed("fake-a", change))
    assert result["due_date"]["value"] is None and result["due_date"]["ambiguous"] is True
    assert line(result, 1)["exp"]["value"] is None
