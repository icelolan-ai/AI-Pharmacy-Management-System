"""Read invoice photos with the real AI, outside the app (6.3).

    python -m app.ai.read_invoices fake     the fake invoices in the repo,
                                            compared with their truth.json
    python -m app.ai.read_invoices real     REAL_INVOICES_DIR/invoices ->
                                            REAL_INVOICES_DIR/runs/<time>/

Files are pages named <document>-p<n>.jpg (fake-a-p1.jpg, 001-p2.jpg, ...).
Each page goes through the same shrink as an upload, and only the for_ai
copy is sent (D68). Nothing touches the database or the bucket.

🔴 Real invoices carry the shop's name and address and the supplier's bank
account. The script refuses them unless (Chat A, 6.3 ก.):
  - GEMINI_PAID_TIER_CONFIRMED=true — set by the owner after switching the
    Gemini account to paid. On the unpaid tier Google may use what is sent to
    improve its products and people may read it (terms of 23 Mar 2026). The
    API gives code no way to check the tier, so the owner's word is the gate;
    the default is "not confirmed".
  - REAL_INVOICES_DIR is set, exists, and lies outside this repository, so
    neither the photos nor the readings (supplier names, prices) can be
    committed.
"""

import json
import re
import sys
import time
from collections import defaultdict
from datetime import date, datetime
from pathlib import Path
from typing import Any

from app.ai import get_provider
from app.ai.base import ImagePart, Part
from app.config import Settings, get_settings
from app.errors import AppError
from app.scan.images import Limits, prepare
from app.scan.invoice_answer import SCHEMA, AnswerRefused, parse_answer
from app.scan.invoice_prompt import PROMPT, PROMPT_VERSION, page_label
from app.scan.invoice_reading import interpret

REPO_ROOT = Path(__file__).resolve().parents[3]
FAKE_DIR = REPO_ROOT / "backend" / "tests" / "fixtures" / "fake_invoices"
_PAGE = re.compile(r"^(?P<doc>.+)-p(?P<page>\d+)\.jpe?g$", re.IGNORECASE)


def real_run_refusals(settings: Settings, repo_root: Path = REPO_ROOT) -> list[str]:
    """Why real invoices may not be read now. Empty means they may."""
    refusals = []
    if settings.gemini_paid_tier_confirmed is not True:
        refusals.append("GEMINI_PAID_TIER_CONFIRMED is not true: real invoices go only to the paid tier")
    if not settings.real_invoices_dir:
        refusals.append("REAL_INVOICES_DIR is empty")
        return refusals
    folder = Path(settings.real_invoices_dir).expanduser().resolve()
    if folder == repo_root.resolve() or repo_root.resolve() in folder.parents:
        refusals.append("REAL_INVOICES_DIR is inside the repository: real invoices must never be where git can see them")
    elif not folder.is_dir():
        refusals.append("REAL_INVOICES_DIR does not exist")
    return refusals


def documents(folder: Path) -> dict[str, list[Path]]:
    found: dict[str, list[tuple[int, Path]]] = defaultdict(list)
    for path in folder.iterdir():
        match = _PAGE.match(path.name)
        if match:
            found[match.group("doc")].append((int(match.group("page")), path))
    return {doc: [path for _, path in sorted(pages)] for doc, pages in sorted(found.items())}


def read_document(pages: list[Path], settings: Settings) -> dict[str, Any]:
    provider = get_provider(settings)
    limits = Limits.from_settings(settings)
    parts: list[Part] = [PROMPT]
    for page_no, path in enumerate(pages, start=1):
        parts.append(page_label(page_no, len(pages)))
        parts.append(ImagePart(prepare(path.read_bytes(), limits).for_ai.data, "image/jpeg"))
    started = time.perf_counter()
    try:
        result = provider.complete_json(parts, SCHEMA, timeout=settings.ai_read_timeout_seconds,
                                        max_output_tokens=settings.ai_max_output_tokens)
    except AppError as exc:
        # Down or busy is not a bad answer (Chat A, ง.): say so, no retry here.
        return {"unavailable": exc.details, "seconds": round(time.perf_counter() - started, 2), "tokens": None}
    out: dict[str, Any] = {
        "model": result.model, "prompt_version": PROMPT_VERSION,
        "seconds": round(time.perf_counter() - started, 2),
        "tokens": {"in": result.prompt_tokens, "out": result.completion_tokens,
                   "thinking": result.thinking_tokens},
    }
    try:
        answer = parse_answer(result.text, len(pages))
    except AnswerRefused as refused:
        out["refused"] = {"reason": refused.reason, "where": refused.where}
        return out
    out["ai"] = answer.model_dump(mode="json")
    out["derived"] = interpret(answer, len(pages), date.today())
    return out


def _dashes(text: str) -> str:
    return re.sub(r"-{2,}", "--", text.strip())


def compare_with_truth(reading: dict[str, Any], truth: dict[str, Any]) -> list[str]:
    """Where a reading of a fake invoice differs from what is printed on it."""
    if "ai" not in reading:
        return [f"not read: {reading.get('refused') or reading.get('unavailable')}"]
    ai, misses = reading["ai"], []

    def same(label: str, field: dict, expected: str | None) -> None:
        got = field["text"] if field["state"] == "read" else None
        # How many dashes a repeat mark has means nothing (D63).
        if _dashes(got or "") != _dashes(expected or ""):
            misses.append(f"{label}: read {got!r}, paper says {expected!r} ({field['state']})")

    for key in ("supplier_name", "supplier_tax_id", "invoice_no", "doc_date"):
        same(key, ai[key], truth[key])
    if len(ai["lines"]) != len(truth["lines"]):
        misses.append(f"lines: {len(ai['lines'])} read, {len(truth['lines'])} on paper")
    for line, want in zip(ai["lines"], truth["lines"]):
        n = want["line_no"]
        same(f"line {n} name", line["name"], want["name"])
        for key, field in (("qty", "quantity"), ("unit", "unit"), ("price", "unit_price"), ("amount", "amount"),
                           ("lot", "lot"), ("mfg", "mfg"), ("exp", "exp"), ("remark", "remark")):
            same(f"line {n} {field}", line[field], want.get(key))
        if want["name"].startswith("---") and not line["repeat"]["present"]:
            misses.append(f"line {n}: repeat mark not reported")
    boxes = [[b["label"], b["amount"]["text"]] for b in ai["totals"]["boxes"]]
    if boxes != truth["totals"]:
        misses.append(f"totals: read {boxes}, paper says {truth['totals']}")
    failed = [c["rule"] for c in reading["derived"]["checks"] if not c["ok"]]
    if failed:
        misses.append(f"checks failed: {failed}")
    return misses


def main(argv: list[str]) -> int:
    if len(argv) != 2 or argv[1] not in ("fake", "real"):
        print(__doc__)
        return 2
    settings = get_settings()
    if argv[1] == "real":
        refusals = real_run_refusals(settings)
        if refusals:
            print("Not reading real invoices:")
            for reason in refusals:
                print("  -", reason)
            return 1
        base = Path(settings.real_invoices_dir).resolve()
        source, out_dir = base / "invoices", base / "runs" / datetime.now().strftime("%Y%m%d-%H%M%S")
        out_dir.mkdir(parents=True)
        for doc, pages in documents(source).items():
            reading = read_document(pages, settings)
            (out_dir / f"{doc}.json").write_text(json.dumps(reading, ensure_ascii=False, indent=1), encoding="utf8")
            print(f"{doc}: {len(pages)} page(s), {reading['seconds']} s, tokens {reading['tokens']},"
                  f" {'refused' if 'refused' in reading else 'read'}")
        print("readings written outside the repository")
        return 0

    truth = json.loads((FAKE_DIR / "truth.json").read_text(encoding="utf8"))
    for doc, pages in documents(FAKE_DIR).items():
        reading = read_document(pages, settings)
        misses = compare_with_truth(reading, truth[doc])
        flags = sum(len(line["flags"]) for line in reading.get("derived", {}).get("lines", []))
        print(f"\n{doc}: {len(pages)} page(s), {reading['seconds']} s, tokens {reading['tokens']},"
              f" flags for a person {flags}")
        for miss in misses or ["matches the paper"]:
            print("  -", miss)
        if "derived" in reading:
            for line in reading["derived"]["lines"]:
                if line["flags"]:
                    print(f"    line {line['line_no']} flags: {line['flags']}")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
