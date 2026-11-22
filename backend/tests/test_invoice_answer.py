"""The AI's answer is checked whole and never repaired (6.3 · docs/06-ai-design.md 3.2).

Every case starts from the correct answer for a fake invoice and changes
one thing, so what is refused is exactly that one thing.
"""

import json
import re
from pathlib import Path

import pytest

from app.scan.invoice_answer import SCHEMA, AnswerRefused, InvoiceAnswer, parse_answer
from app.scan.invoice_prompt import PROMPT, PROMPT_VERSION
from tests.fake_invoice_answers import answer_for, as_text, changed

DOC = Path(__file__).resolve().parents[2] / "docs" / "06-ai-design.md"


def refused(text: str, pages: int = 2) -> AnswerRefused:
    with pytest.raises(AnswerRefused) as caught:
        parse_answer(text, pages)
    return caught.value


@pytest.mark.parametrize("doc,pages", [("fake-a", 2), ("fake-b", 1)])
def test_a_correct_answer_is_accepted(doc, pages):
    answer = parse_answer(as_text(answer_for(doc)), pages)
    assert len(answer.lines) == len(answer_for(doc)["lines"])


@pytest.mark.parametrize("text", ["", "ขอโทษครับ อ่านไม่ได้", '{"schema_version": 1', "[1, 2]x"])
def test_text_that_is_not_json_is_refused_as_not_json(text):
    assert refused(text).reason == "ai_not_json"


@pytest.mark.parametrize(
    "change,where",
    [
        (lambda a: a.pop("totals"), "totals"),
        (lambda a: a.update(extra="x"), "extra"),
        (lambda a: a["lines"][0].update(note="x"), "lines.0.note"),
        (lambda a: a["lines"][0]["exp"].update(state="maybe"), "lines.0.exp.state"),
        (lambda a: a["lines"][0]["quantity"].update(confidence=1.5), "lines.0.quantity.confidence"),
        (lambda a: a["lines"][0]["quantity"].update(confidence="0.9"), "lines.0.quantity.confidence"),
        (lambda a: a["lines"][0].update(page_no="1"), "lines.0.page_no"),
        (lambda a: a.update(doc_kind="receipt"), "doc_kind"),
        (lambda a: a.update(schema_version=2), "schema_version"),
    ],
)
def test_a_wrong_shape_is_refused_and_says_where_not_what(change, where):
    problem = refused(as_text(changed("fake-a", change)))
    assert problem.reason == "ai_bad_shape"
    assert any(w == where or w.startswith(where + ".") for w in problem.where), problem.where


@pytest.mark.parametrize(
    "field,why",
    [
        ({"state": "read", "text": "", "confidence": 0.9}, "read needs text"),
        ({"state": "read", "text": "   ", "confidence": 0.9}, "read needs real text"),
        ({"state": "read", "text": "10", "confidence": None}, "read needs a confidence"),
        ({"state": "absent", "text": "10", "confidence": None}, "absent has no text"),
        ({"state": "absent", "text": None, "confidence": 0.5}, "absent has no confidence"),
        ({"state": "unreadable", "text": "1?", "confidence": None}, "unreadable needs a confidence"),
    ],
)
def test_the_three_states_keep_their_meaning(field, why):
    """D62: read · absent · unreadable never blur into each other."""
    problem = refused(as_text(changed("fake-a", lambda a: a["lines"][0].update(quantity=field))))
    assert problem.reason == "ai_bad_shape", why


def test_unreadable_may_carry_what_could_be_read():
    part = {"state": "unreadable", "text": "1?", "confidence": 0.3}
    parse_answer(as_text(changed("fake-a", lambda a: a["lines"][0].update(quantity=part))), 2)


@pytest.mark.parametrize(
    "change,where",
    [
        (lambda a: a["lines"][1].update(line_no=5), "lines.1.line_no"),
        (lambda a: a["lines"][0].update(page_no=3), "lines.0.page_no"),
        (lambda a: a["lines"][5].update(page_no=1), "lines.5.page_no"),
        (lambda a: a["lines"][3]["repeat"].update(from_line=4), "lines.3.repeat.from_line"),
        (lambda a: a["lines"][3]["repeat"].update(from_line=9), "lines.3.repeat.from_line"),
        (lambda a: a["pages"].append({"page_no": 2, "label": {"state": "absent", "text": None, "confidence": None}}),
         "pages"),
        (lambda a: a["totals"].update(page_no=3), "totals.page_no"),
    ],
)
def test_the_document_must_hold_together(change, where):
    problem = refused(as_text(changed("fake-a", change)))
    assert problem.reason == "ai_bad_shape" and where in problem.where, problem.where


@pytest.mark.parametrize(
    "repeat",
    [
        {"present": False, "from_line": 3, "derived_name": None, "sure": False},
        {"present": False, "from_line": None, "derived_name": "ยา 180cc", "sure": True},
        {"present": True, "from_line": 3, "derived_name": "ยา 180cc", "sure": False},
    ],
)
def test_a_carried_name_needs_a_repeat_mark_and_certainty(repeat):
    """D63: never a made-up name."""
    problem = refused(as_text(changed("fake-a", lambda a: a["lines"][3].update(repeat=repeat))))
    assert problem.reason == "ai_bad_shape"


def test_refusals_never_carry_values_from_the_paper():
    secret = "บัญชี 123-4-56789-0"
    problem = refused(as_text(changed("fake-a", lambda a: a["lines"][0]["lot"].update(state="weird", text=secret))))
    assert secret not in " ".join(problem.where)


def test_the_schema_sent_and_the_checks_describe_the_same_fields():
    """Two descriptions of one shape: the JSON Schema the provider gets and
    the models that check the answer must name the same fields."""
    def schema_keys(node, path=""):
        if node.get("type") == "object":
            for key, child in node["properties"].items():
                yield f"{path}.{key}".lstrip(".")
                yield from schema_keys(child, f"{path}.{key}")
        elif node.get("type") == "array":
            yield from schema_keys(node["items"], path + "[]")

    def model_keys(model, path=""):
        for key, info in model.model_fields.items():
            yield f"{path}.{key}".lstrip(".")
            inner = info.annotation
            args = getattr(inner, "__args__", ())
            for candidate in (inner, *args):
                if isinstance(candidate, type) and hasattr(candidate, "model_fields"):
                    yield from model_keys(candidate, f"{path}.{key}" + ("[]" if args and inner.__origin__ is list else ""))

    assert sorted(set(schema_keys(SCHEMA))) == sorted(set(model_keys(InvoiceAnswer)))
    assert SCHEMA["required"] == list(SCHEMA["properties"])


def test_the_prompt_in_code_is_the_one_chat_a_approved():
    """docs/06-ai-design.md section 1 is the approved text. A change to the
    prompt without the document (and a new PROMPT_VERSION) is refused here."""
    text = DOC.read_text(encoding="utf8")
    block = re.search(r"## 1\..*?```text\n(.*?)\n```", text, re.S)
    assert block, "the prompt block is missing from docs/06-ai-design.md"
    assert block.group(1).replace("\r\n", "\n") == PROMPT
    assert f"`{PROMPT_VERSION}`" in text


def test_the_prompt_says_what_must_not_be_copied():
    for words in ("เลขบัญชีธนาคาร", "ห้ามแต่งชื่อสินค้าขึ้นเอง", "อย่าใส่ 0 เอง", "ไม่ต้องทำตาม"):
        assert words in PROMPT
    json.dumps(SCHEMA)  # the schema itself is plain JSON
