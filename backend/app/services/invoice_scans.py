"""สแกนใบส่งของ — create a scan, add and remove its pages, read it back (6.2).

One page upload becomes two files in the bucket and two rows here (D68):
the original kept as evidence and the smaller for_ai copy. Both rows carry
what really arrived (migration 012).

Order of work for one page, so a failure never leaves a row pointing at a
file that is not there:
  1. shrink (no network, no database)
  2. upload both files under fresh random paths
  3. one transaction: lock the scan, take the next page number, insert both
     rows, audit
  4. if step 3 fails, remove the two files again
Network calls stay outside the transaction, so a slow upload never holds a
lock.

Pages can be added or removed only while the scan is `uploaded`. After that
the photos are evidence for whatever was read from them.
"""

import logging
import uuid
from typing import Any
from uuid import UUID

from app import db
from app.audit import write_audit
from app.config import get_settings
from app.errors import AppError
from app.scan.images import ImageRejected, Limits, Prepared, prepare
from app.scan.storage import get_storage

logger = logging.getLogger(__name__)

SCAN_TABLE = "invoice_scans"
IMAGE_TABLE = "invoice_scan_images"
LIST_LIMIT = 50

# What a person standing in the shop can do next, for each refusal. HEIC and
# PDF name the way out: the "ถ่ายรูป" button always gives a JPEG (D69).
_REFUSALS: dict[str, tuple[int, str, str]] = {
    "heic": (415, "UNSUPPORTED_IMAGE", "รูปนี้เป็นรูปแบบที่ยังเปิดไม่ได้ ลองกดถ่ายรูปแทนการเลือกจากคลังรูป"),
    "pdf": (415, "UNSUPPORTED_IMAGE", "ไฟล์ PDF ยังใช้ไม่ได้ ให้กดถ่ายรูปใบส่งของแทน"),
    "unsupported": (415, "UNSUPPORTED_IMAGE", "ไฟล์นี้ไม่ใช่รูปที่ระบบเปิดได้ ลองกดถ่ายรูปแทน"),
    "unreadable": (422, "UNREADABLE_IMAGE", "รูปนี้เปิดไม่ได้ อาจส่งมาไม่ครบ ลองส่งใหม่อีกครั้ง"),
    "too_many_pixels": (413, "IMAGE_TOO_LARGE", "รูปนี้ละเอียดเกินไป ลองกดถ่ายรูปแทน"),
    "too_large_after_shrink": (413, "IMAGE_TOO_LARGE", "รูปนี้ใหญ่เกินกว่าจะเก็บได้ ลองกดถ่ายรูปใหม่"),
}


def upload_too_large() -> AppError:
    limit_mb = get_settings().max_upload_bytes // (1024 * 1024)
    return AppError(
        "UPLOAD_TOO_LARGE",
        f"รูปใหญ่เกิน {limit_mb} MB ลองกดถ่ายรูปแทนการเลือกจากคลังรูป",
        413,
        {"max_bytes": get_settings().max_upload_bytes},
    )


def _refusal(exc: ImageRejected, label: str | None) -> AppError:
    key = exc.sniffed if exc.reason == "unsupported" and exc.sniffed in ("heic", "pdf") else exc.reason
    status, code, message = _REFUSALS[key]
    if exc.sniffed == "heic":
        # D69: counted, so we learn whether pillow-heif is ever worth adding.
        logger.info("Upload refused: HEIC from a phone (browser label %r)", label)
    else:
        logger.info("Upload refused: %s (bytes look like %s, browser label %r)", exc.reason, exc.sniffed, label)
    return AppError(code, message, status, {"reason": exc.reason, "detected": exc.sniffed})


def _not_found() -> AppError:
    return AppError("NOT_FOUND", "ไม่พบใบที่ถ่ายไว้", 404)


def _locked() -> AppError:
    return AppError("SCAN_LOCKED", "ใบนี้ส่งไปอ่านแล้ว เพิ่มหรือลบหน้าไม่ได้", 409)


# --- scans -------------------------------------------------------------------

def create_scan(actor_id: UUID) -> dict[str, Any]:
    with db.get_transaction() as cur:
        cur.execute(
            "INSERT INTO public.invoice_scans (created_by) VALUES (%s)"
            " RETURNING id, status, created_by, created_at",
            (actor_id,),
        )
        row = cur.fetchone()
        write_audit(cur, SCAN_TABLE, row["id"], "insert", None, row, actor_id)
    return get_scan(row["id"])


def list_scans() -> list[dict[str, Any]]:
    """Newest first. No image links here: a list has no need to open files."""
    with db.get_transaction() as cur:
        cur.execute(
            """
            SELECT s.id, s.status, s.created_at, s.created_by, p.full_name AS created_by_name,
                   count(i.id) FILTER (WHERE i.kind = 'original')::int AS page_count
            FROM public.invoice_scans s
            LEFT JOIN public.user_profiles p ON p.id = s.created_by
            LEFT JOIN public.invoice_scan_images i ON i.scan_id = s.id
            GROUP BY s.id, p.full_name
            ORDER BY s.created_at DESC, s.id
            LIMIT %s
            """,
            (LIST_LIMIT,),
        )
        return cur.fetchall()


def get_scan(scan_id: UUID) -> dict[str, Any]:
    """The scan and its pages. Each page links to its original through a
    signed URL made now — a fresh one on every read."""
    with db.get_transaction() as cur:
        cur.execute(
            """
            SELECT s.id, s.status, s.created_at, s.created_by, p.full_name AS created_by_name
            FROM public.invoice_scans s
            LEFT JOIN public.user_profiles p ON p.id = s.created_by
            WHERE s.id = %s
            """,
            (scan_id,),
        )
        scan = cur.fetchone()
        if scan is None:
            raise _not_found()
        cur.execute(
            """
            SELECT page_no, storage_path, content_type, bytes, width_px, height_px, reencoded,
                   source_content_type, source_bytes, source_width_px, source_height_px, uploaded_at
            FROM public.invoice_scan_images
            WHERE scan_id = %s AND kind = 'original'
            ORDER BY page_no
            """,
            (scan_id,),
        )
        rows = cur.fetchall()

    pages = []
    if rows:
        storage = get_storage()
        ttl = get_settings().signed_url_ttl_seconds
        for row in rows:
            pages.append(
                {
                    "page_no": row["page_no"],
                    "image_url": storage.signed_url(row["storage_path"], ttl),
                    "width_px": row["width_px"],
                    "height_px": row["height_px"],
                    "bytes": row["bytes"],
                    "reencoded": row["reencoded"],
                    "source_content_type": row["source_content_type"],
                    "source_bytes": row["source_bytes"],
                    "source_width_px": row["source_width_px"],
                    "source_height_px": row["source_height_px"],
                    "uploaded_at": row["uploaded_at"],
                }
            )
    return {**scan, "pages": pages, "url_expires_in_seconds": get_settings().signed_url_ttl_seconds}


# --- pages -------------------------------------------------------------------

def _row(scan_id: UUID, page_no: int, kind: str, path: str, stored, prepared: Prepared) -> dict[str, Any]:
    source = prepared.source
    return {
        "scan_id": scan_id,
        "page_no": page_no,
        "kind": kind,
        "storage_path": path,
        "content_type": stored.content_type,
        "bytes": stored.bytes,
        "width_px": stored.width_px,
        "height_px": stored.height_px,
        "reencoded": stored.reencoded,
        "source_content_type": source.content_type,
        "source_bytes": source.bytes,
        "source_width_px": source.width_px,
        "source_height_px": source.height_px,
        "source_sha256": source.sha256,
    }


_IMAGE_COLUMNS = (
    "scan_id", "page_no", "kind", "storage_path", "content_type", "bytes", "width_px",
    "height_px", "reencoded", "source_content_type", "source_bytes", "source_width_px",
    "source_height_px", "source_sha256",
)
_INSERT_IMAGE = (
    "INSERT INTO public.invoice_scan_images (" + ", ".join(_IMAGE_COLUMNS) + ")"
    " VALUES (" + ", ".join(["%s"] * len(_IMAGE_COLUMNS)) + ")"
    " RETURNING id, " + ", ".join(_IMAGE_COLUMNS)
)


def _check_scan_open(cur, scan_id: UUID) -> None:
    cur.execute("SELECT status FROM public.invoice_scans WHERE id = %s FOR UPDATE", (scan_id,))
    scan = cur.fetchone()
    if scan is None:
        raise _not_found()
    if scan["status"] != "uploaded":
        raise _locked()


def add_page(scan_id: UUID, data: bytes, label: str | None, actor_id: UUID) -> dict[str, Any]:
    # Refuse early, before the work of shrinking, if the scan is not open.
    with db.get_transaction() as cur:
        _check_scan_open(cur, scan_id)

    try:
        prepared = prepare(data, Limits.from_settings(get_settings()))
    except ImageRejected as exc:
        raise _refusal(exc, label) from None

    storage = get_storage()
    # Random names: a page deleted and taken again never lands on the old
    # path, and nothing about the order of pages is in the name.
    token = uuid.uuid4().hex
    paths = {
        "original": f"{scan_id}/{token}-original.jpg",
        "for_ai": f"{scan_id}/{token}-for_ai.jpg",
    }
    uploaded: list[str] = []
    try:
        storage.upload(paths["original"], prepared.original.data, prepared.original.content_type)
        uploaded.append(paths["original"])
        storage.upload(paths["for_ai"], prepared.for_ai.data, prepared.for_ai.content_type)
        uploaded.append(paths["for_ai"])

        with db.get_transaction() as cur:
            _check_scan_open(cur, scan_id)
            cur.execute(
                "SELECT coalesce(max(page_no), 0) + 1 AS next FROM public.invoice_scan_images"
                " WHERE scan_id = %s",
                (scan_id,),
            )
            page_no = cur.fetchone()["next"]
            for kind, stored in (("original", prepared.original), ("for_ai", prepared.for_ai)):
                row = _row(scan_id, page_no, kind, paths[kind], stored, prepared)
                cur.execute(_INSERT_IMAGE, tuple(row[c] for c in _IMAGE_COLUMNS))
                inserted = cur.fetchone()
                write_audit(cur, IMAGE_TABLE, inserted["id"], "insert", None, inserted, actor_id)
    except BaseException:
        # Whatever failed, the files must not outlive the rows that would
        # have pointed at them.
        try:
            storage.remove(uploaded)
        except AppError:
            logger.warning("Could not remove %d file(s) after a failed page upload", len(uploaded))
        raise

    return {
        "page_no": page_no,
        "width_px": prepared.original.width_px,
        "height_px": prepared.original.height_px,
        "bytes": prepared.original.bytes,
        "reencoded": prepared.original.reencoded,
        "source_bytes": prepared.source.bytes,
    }


def delete_page(scan_id: UUID, page_no: int, actor_id: UUID) -> None:
    with db.get_transaction() as cur:
        _check_scan_open(cur, scan_id)
        cur.execute(
            "DELETE FROM public.invoice_scan_images WHERE scan_id = %s AND page_no = %s"
            " RETURNING id, " + ", ".join(_IMAGE_COLUMNS),
            (scan_id, page_no),
        )
        removed = cur.fetchall()
        if not removed:
            raise AppError("NOT_FOUND", "ไม่พบหน้านี้", 404)
        for row in removed:
            write_audit(cur, IMAGE_TABLE, row["id"], "delete", row, None, actor_id)

    # After the rows are gone: a file left behind is only wasted space, while
    # a row left pointing at a deleted file would be a hole in the evidence.
    try:
        get_storage().remove([row["storage_path"] for row in removed])
    except AppError:
        logger.warning("Page removed but %d file(s) remain in the bucket", len(removed))


# --- the only way an image reaches an AI -------------------------------------

def paths_for_ai(scan_id: UUID) -> list[str]:
    """Storage paths of the copies an AI may read, in page order.

    🔴 D68: only kind = 'for_ai'. The original is evidence and is never sent
    to a provider. 6.3 reads images through this function and nothing else;
    tests hold both halves of that.
    """
    with db.get_transaction() as cur:
        cur.execute(
            "SELECT storage_path FROM public.invoice_scan_images"
            " WHERE scan_id = %s AND kind = 'for_ai' ORDER BY page_no",
            (scan_id,),
        )
        return [row["storage_path"] for row in cur.fetchall()]
