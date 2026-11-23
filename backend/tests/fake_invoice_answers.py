"""AI answers built from the fake invoices' truth.json (6.3).

A correct answer is what a perfect reader would send for the fake paper:
every printed value "read" exactly as printed, everything not on the paper
"absent". Tests change one thing in it at a time, so each rule is seen
deciding against the same document the pictures show.
"""

import copy
import json
from pathlib import Path
from typing import Any

TRUTH = json.loads(
    (Path(__file__).parent / "fixtures" / "fake_invoices" / "truth.json").read_text(encoding="utf8")
)


def read(text: str | None, confidence: float = 0.99) -> dict[str, Any]:
    if text is None or text == "":
        return {"state": "absent", "text": None, "confidence": None}
    return {"state": "read", "text": text, "confidence": confidence}


def answer_for(doc: str) -> dict[str, Any]:
    truth = TRUTH[doc]
    lines = []
    for line in truth["lines"]:
        repeat = {"present": False, "from_line": None, "derived_name": None, "sure": False}
        if line["name"].startswith("---"):
            source = lines[-1]
            size = line["name"].lstrip("- ").strip()
            base = source["name"]["text"].rsplit(" ", 1)[0]
            repeat = {"present": True, "from_line": source["line_no"], "derived_name": f"{base} {size}", "sure": True}
        lines.append({
            "page_no": line["page_no"], "line_no": line["line_no"], "name": read(line["name"]), "repeat": repeat,
            "quantity": read(line.get("qty")), "unit": read(line.get("unit")),
            "unit_price": read(line.get("price")), "line_discount": read(None), "amount": read(line.get("amount")),
            "lot": read(line.get("lot")), "mfg": read(line.get("mfg")), "exp": read(line.get("exp")),
            "remark": read(line.get("remark")),
        })
    return {
        "schema_version": 2,
        "doc_kind": truth["doc_kind"],
        "supplier_name": read(truth["supplier_name"]),
        "supplier_tax_id": read(truth["supplier_tax_id"]),
        "invoice_no": read(truth["invoice_no"]),
        "doc_date": read(truth["doc_date"]),
        "due_date": read(truth.get("due_date")),
        "pages": [{"page_no": n, "label": read(f"หน้า {n}/{truth['page_count']}" if truth["page_count"] > 1 else None)}
                  for n in range(1, truth["page_count"] + 1)],
        "lines": lines,
        "totals": {"page_no": truth["totals_page"],
                   "boxes": [{"label": label, "amount": read(amount)} for label, amount in truth["totals"]]},
    }


def changed(doc: str, change) -> dict[str, Any]:
    """A copy of the correct answer with one thing changed by `change(answer)`."""
    answer = copy.deepcopy(answer_for(doc))
    change(answer)
    return answer


def as_text(answer: dict[str, Any]) -> str:
    return json.dumps(answer, ensure_ascii=False)
