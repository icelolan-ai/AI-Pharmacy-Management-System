"""Reading one photographed invoice with AI (6.3 · docs/06-ai-design.md 3).

    uploaded | failed | extracting left over (> STALE_AFTER)
        -> extracting -> needs_review   (the reading is kept in `extracted`)
                      -> failed         (failed_reason says why; raw kept)

🔴 The AI cannot write stock, lots or purchases (Chat A: four layers):
  1. code     — this module's only database writes are UPDATE of
                public.invoice_scans and its audit rows; it imports nothing
                that writes stock (tests/test_ai_cannot_write_stock.py reads
                this file and fails if that changes).
  2. tests    — a reading run against the test database with an answer full
                of instructions leaves every stock table exactly as it was.
  3. process  — the only way from a reading to stock is a person creating a
                purchase through the existing endpoint with their own rights
                (6.6), and it stays a draft until counted and confirmed.
  4. answer   — what the AI says is only ever a parameter value stored in
                jsonb: never put into SQL text, never a path or a URL; no
                tools are offered to it; its length is capped.

Every call to the AI is recorded — tokens, cost, model, prompt version —
even when it fails (Chat A, ง.): the row keeps the latest call and the audit
log keeps one row per call. A provider that is down or slow is not a bad
answer: it is `ai_unavailable`, and a person presses read again (6.4); there
is no silent retry.
"""

import logging
import time
from datetime import date, timedelta
from decimal import ROUND_HALF_UP, Decimal
from typing import Any
from uuid import UUID

from psycopg.types.json import Jsonb

from app import db
from app.ai import get_provider
from app.ai.base import AIProvider, AIResult, ImagePart, Part
from app.audit import write_audit
from app.config import ConfigError, get_settings
from app.errors import AppError
from app.scan.invoice_answer import SCHEMA, SCHEMA_VERSION, AnswerRefused, parse_answer
from app.scan.invoice_prompt import PROMPT, PROMPT_VERSION, page_label
from app.scan.invoice_reading import interpret
from app.scan.storage import get_storage

logger = logging.getLogger(__name__)

SCAN_TABLE = "invoice_scans"
# D72: guessed. A reading measured 9.6 s (D67); a scan still "extracting"
# after this long is taken to be left behind by a server that stopped, and
# may be read again. Review after real invoices.
STALE_AFTER = timedelta(minutes=5)
READABLE_FROM = ("uploaded", "failed")

# What the audit row keeps of each call: what it cost and how it ended —
# not the reading itself, which can carry supplier details.
_AUDITED = ("status", "failed_reason", "provider", "model", "prompt_version",
            "tokens_in", "tokens_out", "thinking_tokens", "cost_estimate_satang")


def _not_found() -> AppError:
    return AppError("SCAN_NOT_FOUND", "ไม่พบใบที่สแกน", 404)


def _cannot_read(status: str) -> AppError:
    return AppError(
        "SCAN_NOT_READABLE",
        "ใบนี้อ่านไปแล้วหรือกำลังอ่านอยู่",
        409,
        {"status": status},
    )


def _audited(row: dict[str, Any]) -> dict[str, Any]:
    return {key: row.get(key) for key in _AUDITED}


def cost_satang(result: AIResult | None) -> int | None:
    """Tokens x price x rate, rounded half up. None while anything needed is
    unknown — the provider did not report tokens, or no rate is set."""
    settings = get_settings()
    rate = settings.ai_usd_thb_rate
    price_in = settings.ai_price_input_usd_per_mtok
    price_out = settings.ai_price_output_usd_per_mtok
    if result is None or None in (rate, price_in, price_out):
        return None
    if result.prompt_tokens is None or result.completion_tokens is None:
        return None
    paid_out = result.completion_tokens + (result.thinking_tokens or 0)
    usd = (Decimal(result.prompt_tokens) * Decimal(str(price_in))
           + Decimal(paid_out) * Decimal(str(price_out))) / Decimal(1_000_000)
    return int((usd * Decimal(str(rate)) * 100).quantize(Decimal("1"), rounding=ROUND_HALF_UP))


def _claim(scan_id: UUID, actor_id: UUID) -> tuple[list[str], date]:
    """Move the scan to extracting, or refuse. Returns the for_ai paths and
    the shop's date the scan was made (D87 suggests a header date from it)."""
    with db.get_transaction() as cur:
        cur.execute(
            "SELECT id, status, updated_at, now() - updated_at AS age,"
            " (created_at AT TIME ZONE %s)::date AS uploaded_on FROM public.invoice_scans"
            " WHERE id = %s FOR UPDATE",
            (get_settings().store_timezone, scan_id),
        )
        scan = cur.fetchone()
        if scan is None:
            raise _not_found()
        left_over = scan["status"] == "extracting" and scan["age"] > STALE_AFTER
        if scan["status"] not in READABLE_FROM and not left_over:
            raise _cannot_read(scan["status"])
        cur.execute(
            "SELECT storage_path FROM public.invoice_scan_images"
            " WHERE scan_id = %s AND kind = 'for_ai' ORDER BY page_no",
            (scan_id,),
        )
        paths = [row["storage_path"] for row in cur.fetchall()]
        if not paths:
            raise AppError("SCAN_HAS_NO_PAGES", "ยังไม่มีรูปในใบนี้ ถ่ายรูปก่อนแล้วค่อยอ่าน", 409)
        cur.execute(
            "UPDATE public.invoice_scans SET status = 'extracting', failed_reason = NULL"
            " WHERE id = %s RETURNING *",
            (scan_id,),
        )
        row = cur.fetchone()
        write_audit(cur, SCAN_TABLE, scan_id, "update", {"status": scan["status"]}, _audited(row), actor_id,
                    reason="เริ่มอ่านใบด้วย AI")
    return paths, scan["uploaded_on"]


def _finish(scan_id: UUID, actor_id: UUID, values: dict[str, Any]) -> dict[str, Any]:
    columns = ("status", "failed_reason", "provider", "model", "prompt_version", "tokens_in",
               "tokens_out", "thinking_tokens", "cost_estimate_satang", "raw_response", "extracted", "doc_kind")
    with db.get_transaction() as cur:
        cur.execute(
            "UPDATE public.invoice_scans SET "
            + ", ".join(f"{column} = %s" for column in columns)
            + " WHERE id = %s RETURNING *",
            (*(values.get(column) for column in columns), scan_id),
        )
        row = cur.fetchone()
        write_audit(cur, SCAN_TABLE, scan_id, "update", {"status": "extracting"}, _audited(row), actor_id,
                    reason="อ่านใบด้วย AI จบแล้ว")
    return row


def extract(scan_id: UUID, actor_id: UUID, provider: AIProvider | None = None) -> dict[str, Any]:
    paths, uploaded_on = _claim(scan_id, actor_id)
    settings = get_settings()
    values: dict[str, Any] = {"prompt_version": PROMPT_VERSION}
    result: AIResult | None = None
    started = time.perf_counter()
    try:
        try:
            provider = provider or get_provider()
        except ConfigError:
            raise AppError("AI_NOT_CONFIGURED", "ยังไม่ได้ตั้งค่า AI", 503) from None
        values.update(provider=provider.name, model=provider.model)
        storage = get_storage()
        parts: list[Part] = [PROMPT]
        for page_no, path in enumerate(paths, start=1):
            parts.append(page_label(page_no, len(paths)))
            parts.append(ImagePart(storage.download(path), "image/jpeg"))
        result = provider.complete_json(
            parts, SCHEMA,
            timeout=settings.ai_read_timeout_seconds,
            max_output_tokens=settings.ai_max_output_tokens,
        )
        values.update(
            tokens_in=result.prompt_tokens, tokens_out=result.completion_tokens,
            thinking_tokens=result.thinking_tokens, cost_estimate_satang=cost_satang(result),
            raw_response=Jsonb(result.raw_body) if result.raw_body is not None else None,
        )
        answer = parse_answer(result.text, len(paths))
        derived = interpret(answer, len(paths), uploaded_on)
        values.update(
            status="needs_review",
            doc_kind=answer.doc_kind,
            extracted=Jsonb({"schema_version": SCHEMA_VERSION, "ai": answer.model_dump(mode="json"),
                             "derived": derived}),
        )
    except AnswerRefused as refused:
        where = ",".join(refused.where[:10])
        values.update(status="failed", failed_reason=f"{refused.reason}: {where}" if where else refused.reason)
    except AppError as exc:
        reason = {"STORAGE_UNAVAILABLE": "storage_unavailable"}.get(exc.code, "ai_unavailable")
        status = (exc.details or {}).get("status") if isinstance(exc.details, dict) else None
        values.update(status="failed", failed_reason=f"{reason}: {exc.code}" + (f" {status}" if status else ""))
    except Exception as exc:  # anything else must not leave the scan stuck in extracting
        logger.exception("Reading scan failed unexpectedly")
        values.update(status="failed", failed_reason=f"internal_error: {type(exc).__name__}")
    row = _finish(scan_id, actor_id, values)
    logger.info(
        "Scan read: %s in %d ms, pages %d, tokens in %s out %s thinking %s",
        row["status"], (time.perf_counter() - started) * 1000, len(paths),
        row["tokens_in"], row["tokens_out"], row["thinking_tokens"],
    )
    return row
