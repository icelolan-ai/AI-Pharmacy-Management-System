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


from app.ai.stand_in import answer_from_truth  # noqa: E402  — one builder for tests and the stand-in


def read(text: str | None, confidence: float = 0.99) -> dict[str, Any]:
    if text is None or text == "":
        return {"state": "absent", "text": None, "confidence": None}
    return {"state": "read", "text": text, "confidence": confidence}


def answer_for(doc: str) -> dict[str, Any]:
    return answer_from_truth(doc)


def changed(doc: str, change) -> dict[str, Any]:
    """A copy of the correct answer with one thing changed by `change(answer)`."""
    answer = copy.deepcopy(answer_for(doc))
    change(answer)
    return answer


def as_text(answer: dict[str, Any]) -> str:
    return json.dumps(answer, ensure_ascii=False)
