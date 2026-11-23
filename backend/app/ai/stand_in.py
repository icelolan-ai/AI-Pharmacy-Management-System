"""A stand-in for the AI, to try the review page while Gemini answers 503
(Chat A, after 6.4 — approved with conditions):

  - off unless AI_STAND_IN_ENABLED=true is set by hand; default off;
  - 🔴 never in production, whatever is set: only when APP_ENV=development
    (APP_ENV itself defaults to production);
  - every scan it reads is recorded with provider "stand-in", and the review
    page says in words: "ใบทดสอบ — ข้อมูลนี้ไม่ได้อ่านโดย AI", so nobody
    takes it as the AI reading this well;
  - it only ever answers with a FAKE invoice's own truth (tests/fixtures/
    fake_invoices/truth.json), never anything about a real invoice.

    AI_STAND_IN_ENABLED=true APP_ENV=development \\
        python -m app.ai.stand_in prepare <owner-user-id>

`prepare` makes one scan from fake invoice A (its two photos go through the
normal upload), reads it with the stand-in, and prints the scan's id. The
person deletes it with "ลบทั้งใบ" after trying the page.
"""

import json
import sys
from pathlib import Path
from typing import Any
from uuid import UUID

from app.ai.base import AIResult
from app.config import Settings, get_settings

PROVIDER_NAME = "stand-in"
FAKE_DIR = Path(__file__).resolve().parents[2] / "tests" / "fixtures" / "fake_invoices"
TEST_LABEL = "ใบทดสอบ — ข้อมูลนี้ไม่ได้อ่านโดย AI"


def stand_in_refusals(settings: Settings) -> list[str]:
    """Why the stand-in may not run now. Empty means it may."""
    refusals = []
    if settings.ai_stand_in_enabled is not True:
        refusals.append("AI_STAND_IN_ENABLED is not true (it is off unless set by hand)")
    if not settings.is_development:
        refusals.append("APP_ENV is not development: the stand-in never runs in production")
    return refusals


def _field(text: str | None, confidence: float = 0.99) -> dict[str, Any]:
    if text is None or text == "":
        return {"state": "absent", "text": None, "confidence": None}
    return {"state": "read", "text": text, "confidence": confidence}


def answer_from_truth(doc: str) -> dict[str, Any]:
    """What a perfect reader would send for a fake invoice: everything printed
    read exactly as printed, everything not on the paper absent."""
    truth = json.loads((FAKE_DIR / "truth.json").read_text(encoding="utf8"))[doc]
    lines: list[dict[str, Any]] = []
    for line in truth["lines"]:
        repeat = {"present": False, "from_line": None, "derived_name": None, "sure": False}
        if line["name"].startswith("---"):
            source = lines[-1]
            size = line["name"].lstrip("- ").strip()
            base = source["name"]["text"].rsplit(" ", 1)[0]
            repeat = {"present": True, "from_line": source["line_no"], "derived_name": f"{base} {size}", "sure": True}
        lines.append({
            "page_no": line["page_no"], "line_no": line["line_no"], "name": _field(line["name"]), "repeat": repeat,
            "quantity": _field(line.get("qty")), "unit": _field(line.get("unit")),
            "unit_price": _field(line.get("price")), "line_discount": _field(None), "amount": _field(line.get("amount")),
            "lot": _field(line.get("lot")), "mfg": _field(line.get("mfg")), "exp": _field(line.get("exp")),
            "remark": _field(line.get("remark")),
        })
    pages = truth["page_count"]
    return {
        "schema_version": 2,
        "doc_kind": truth["doc_kind"],
        "supplier_name": _field(truth["supplier_name"]),
        "supplier_tax_id": _field(truth["supplier_tax_id"]),
        "invoice_no": _field(truth["invoice_no"]),
        "doc_date": _field(truth["doc_date"]),
        "due_date": _field(truth.get("due_date")),
        "pages": [{"page_no": n, "label": _field(f"หน้า {n}/{pages}" if pages > 1 else None)} for n in range(1, pages + 1)],
        "lines": lines,
        "totals": {"page_no": truth["totals_page"],
                   "boxes": [{"label": label, "amount": _field(amount)} for label, amount in truth["totals"]]},
    }


class StandInProvider:
    """Answers with fake invoice A's truth. One field is given low confidence
    on purpose, so the page shows a "ต้องตรวจ" a person must touch."""

    name = PROVIDER_NAME
    model = "fake-invoice-truth"

    def __init__(self, settings: Settings | None = None, doc: str = "fake-a"):
        refusals = stand_in_refusals(settings or get_settings())
        if refusals:
            raise RuntimeError("; ".join(refusals))
        self.doc = doc

    def complete_json(self, parts, schema, *, timeout, max_output_tokens) -> AIResult:
        answer = answer_from_truth(self.doc)
        answer["lines"][0]["lot"]["confidence"] = 0.7
        return AIResult(
            text=json.dumps(answer, ensure_ascii=False), provider=self.name, model=self.model,
            prompt_tokens=None, completion_tokens=None, thinking_tokens=None, total_tokens=None, latency_ms=0,
            raw_body={"stand_in": TEST_LABEL},
        )


def prepare(owner_id: UUID) -> UUID:
    """One scan from fake invoice A, uploaded and read with the stand-in."""
    from app import db
    from app.scan import storage
    from app.services import invoice_extraction, invoice_scans

    settings = get_settings()
    provider = StandInProvider(settings)       # refuses before anything is made
    db.open_pool(settings)
    storage.open_http()
    try:
        scan_id = invoice_scans.create_scan(owner_id)["id"]
        for page in sorted(FAKE_DIR.glob("fake-a-p*.jpg")):
            invoice_scans.add_page(scan_id, page.read_bytes(), "image/jpeg", owner_id)
        invoice_extraction.extract(scan_id, owner_id, provider=provider)
        return scan_id
    finally:
        storage.close_http()
        db.close_pool()


def main(argv: list[str]) -> int:
    if len(argv) != 3 or argv[1] != "prepare":
        print(__doc__)
        return 2
    refusals = stand_in_refusals(get_settings())
    if refusals:
        print("Not running the stand-in:")
        for reason in refusals:
            print("  -", reason)
        return 1
    print("prepared scan:", prepare(UUID(argv[2])))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
