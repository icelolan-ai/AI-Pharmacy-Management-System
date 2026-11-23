"""The shape of the AI's answer for one invoice (6.3 · docs/06-ai-design.md 2).

Two descriptions of the same shape, kept side by side on purpose:
  SCHEMA       JSON Schema sent to the provider (generationConfig
               responseJsonSchema — D67, asked of the real API).
  InvoiceAnswer  the pydantic models that check what comes back.
The provider is asked to keep to SCHEMA but nothing guarantees it (Google's
own docs say to check the values), so every answer goes through
`parse_answer` before anything is kept. Nothing is repaired: an answer that
does not fit is refused whole (3.2).

D84: everything here is text as it stood on the paper. Turning it into
numbers, dates, free goods and checks is invoice_reading.py.
"""

import json
from typing import Annotated, Any, Literal

from pydantic import (
    BaseModel, ConfigDict, Field, StrictBool, StrictFloat, StrictInt, StrictStr, ValidationError, model_validator,
)

# 1: 6.3 (invoice-6.3-v1) · 2: 6.4 adds due_date (invoice-6.4-v2, D87)
SCHEMA_VERSION = 2
LINE_FIELDS = ("quantity", "unit", "unit_price", "line_discount", "amount", "lot", "mfg", "exp", "remark")
DOC_KINDS = ("tax_invoice", "delivery_note", "handwritten", "unknown")


# --- the JSON Schema sent to the provider -----------------------------------

def _field_schema() -> dict[str, Any]:
    return {
        "type": "object",
        "additionalProperties": False,
        "required": ["state", "text", "confidence"],
        "properties": {
            "state": {"type": "string", "enum": ["read", "absent", "unreadable"]},
            "text": {"type": ["string", "null"]},
            "confidence": {"type": ["number", "null"], "minimum": 0, "maximum": 1},
        },
    }


def _object(properties: dict[str, Any]) -> dict[str, Any]:
    return {"type": "object", "additionalProperties": False,
            "required": list(properties), "properties": properties}


SCHEMA: dict[str, Any] = _object({
    "schema_version": {"type": "integer", "enum": [SCHEMA_VERSION]},
    "doc_kind": {"type": "string", "enum": list(DOC_KINDS)},
    "supplier_name": _field_schema(),
    "supplier_tax_id": _field_schema(),
    "invoice_no": _field_schema(),
    "doc_date": _field_schema(),
    "due_date": _field_schema(),
    "pages": {"type": "array", "items": _object({
        "page_no": {"type": "integer", "minimum": 1},
        "label": _field_schema(),
    })},
    "lines": {"type": "array", "items": _object({
        "page_no": {"type": "integer", "minimum": 1},
        "line_no": {"type": "integer", "minimum": 1},
        "name": _field_schema(),
        "repeat": _object({
            "present": {"type": "boolean"},
            "from_line": {"type": ["integer", "null"]},
            "derived_name": {"type": ["string", "null"]},
            "sure": {"type": "boolean"},
        }),
        **{name: _field_schema() for name in LINE_FIELDS},
    })},
    "totals": _object({
        "page_no": {"type": ["integer", "null"]},
        "boxes": {"type": "array", "items": _object({
            "label": {"type": "string"},
            "amount": _field_schema(),
        })},
    }),
})


# --- the same shape, checked -----------------------------------------------

class _Strict(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)


class FieldValue(_Strict):
    """One thing on the paper, in one of three states (D62)."""

    state: Literal["read", "absent", "unreadable"]
    text: StrictStr | None
    confidence: Annotated[StrictFloat, Field(ge=0, le=1)] | None

    @model_validator(mode="after")
    def _state_rules(self):
        if self.state == "read" and (self.text is None or not self.text.strip()):
            raise ValueError("read needs the text that was read")
        if self.state == "read" and self.confidence is None:
            raise ValueError("read needs a confidence")
        if self.state == "absent" and (self.text is not None or self.confidence is not None):
            raise ValueError("absent has no text and no confidence")
        if self.state == "unreadable" and self.confidence is None:
            raise ValueError("unreadable needs a confidence")
        return self


class Repeat(_Strict):
    """A repeat mark (D63): the line is the line above, except for what is written."""

    present: StrictBool
    from_line: StrictInt | None
    derived_name: StrictStr | None
    sure: StrictBool

    @model_validator(mode="after")
    def _rules(self):
        if not self.present and (self.from_line is not None or self.derived_name is not None):
            raise ValueError("no repeat mark, so nothing is carried from another line")
        if self.derived_name is not None and not self.sure:
            raise ValueError("a carried name is given only when sure")
        return self


class Line(_Strict):
    page_no: Annotated[StrictInt, Field(ge=1)]
    line_no: Annotated[StrictInt, Field(ge=1)]
    name: FieldValue
    repeat: Repeat
    quantity: FieldValue
    unit: FieldValue
    unit_price: FieldValue
    line_discount: FieldValue
    amount: FieldValue
    lot: FieldValue
    mfg: FieldValue
    exp: FieldValue
    remark: FieldValue


class Page(_Strict):
    page_no: Annotated[StrictInt, Field(ge=1)]
    label: FieldValue


class TotalBox(_Strict):
    label: StrictStr
    amount: FieldValue


class Totals(_Strict):
    page_no: StrictInt | None
    boxes: list[TotalBox]


class InvoiceAnswer(_Strict):
    schema_version: Literal[2]
    doc_kind: Literal["tax_invoice", "delivery_note", "handwritten", "unknown"]
    supplier_name: FieldValue
    supplier_tax_id: FieldValue
    invoice_no: FieldValue
    doc_date: FieldValue
    due_date: FieldValue
    pages: list[Page]
    lines: list[Line]
    totals: Totals


class AnswerRefused(Exception):
    """The answer is not kept. `reason` is a code; `where` names fields,
    never their values (a value can carry supplier details)."""

    def __init__(self, reason: str, where: list[str]):
        super().__init__(reason)
        self.reason = reason
        self.where = where


def _whole_document_problems(answer: InvoiceAnswer, page_count: int) -> list[str]:
    problems: list[str] = []
    for index, line in enumerate(answer.lines, start=1):
        if line.line_no != index:
            problems.append(f"lines.{index - 1}.line_no")
        if line.page_no > page_count:
            problems.append(f"lines.{index - 1}.page_no")
        if index > 1 and line.page_no < answer.lines[index - 2].page_no:
            problems.append(f"lines.{index - 1}.page_no")
        if line.repeat.from_line is not None and not 1 <= line.repeat.from_line < line.line_no:
            problems.append(f"lines.{index - 1}.repeat.from_line")
    seen_pages = [page.page_no for page in answer.pages]
    if len(seen_pages) != len(set(seen_pages)) or any(p > page_count for p in seen_pages):
        problems.append("pages")
    if answer.totals.page_no is not None and not 1 <= answer.totals.page_no <= page_count:
        problems.append("totals.page_no")
    return problems


def parse_answer(text: str, page_count: int) -> InvoiceAnswer:
    """The AI's text, checked whole, or AnswerRefused. Never repaired."""
    try:
        data = json.loads(text)
    except (TypeError, ValueError):
        raise AnswerRefused("ai_not_json", []) from None
    try:
        answer = InvoiceAnswer.model_validate(data)
    except ValidationError as exc:
        where = sorted({".".join(str(part) for part in error["loc"]) or "(whole answer)" for error in exc.errors()})
        raise AnswerRefused("ai_bad_shape", where) from None
    problems = _whole_document_problems(answer, page_count)
    if problems:
        raise AnswerRefused("ai_bad_shape", sorted(set(problems)))
    return answer
