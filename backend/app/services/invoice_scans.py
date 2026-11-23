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
import time
import uuid
from concurrent.futures import ThreadPoolExecutor
from typing import Any
from uuid import UUID

from app import db
from app.audit import write_audit
from app.config import get_settings
from app.errors import AppError
from app.scan.images import ImageRejected, Limits, Prepared, prepare
from app.scan.storage import get_storage
from app.services import invoice_review

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
            SELECT s.id, s.status, s.created_at, s.created_by, p.full_name AS created_by_name,
                   s.failed_reason, s.doc_kind, s.extracted, s.reviewed_at, r.full_name AS reviewed_by_name,
                   s.rejected_reason, s.rejected_at
            FROM public.invoice_scans s
            LEFT JOIN public.user_profiles p ON p.id = s.created_by
            LEFT JOIN public.user_profiles r ON r.id = s.reviewed_by
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
        corrections = invoice_review.current(cur, scan_id)

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
    settings = get_settings()
    return {
        **scan,
        "corrections": corrections,
        "untouched": invoice_review.untouched(scan["extracted"], corrections),
        "pages": pages,
        "url_expires_in_seconds": settings.signed_url_ttl_seconds,
        # D75: the phone shrinks with exactly what the backend would use.
        "device_resize": {
            "max_edge_px": settings.original_max_edge_px,
            "jpeg_quality": settings.original_jpeg_quality,
        },
    }


# --- pages -------------------------------------------------------------------

def _row(scan_id: UUID, page_no: int, kind: str, path: str, stored, prepared: Prepared,
         client_reported_resized: bool) -> dict[str, Any]:
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
        "picture_sha256": stored.picture_sha256,
        "source_picture_sha256": source.picture_sha256,
        # D75: what the phone says. Unverifiable (D69) — recorded, never trusted.
        "client_reported_resized": client_reported_resized,
    }


_IMAGE_COLUMNS = (
    "scan_id", "page_no", "kind", "storage_path", "content_type", "bytes", "width_px",
    "height_px", "reencoded", "source_content_type", "source_bytes", "source_width_px",
    "source_height_px", "source_sha256", "picture_sha256", "source_picture_sha256",
    "client_reported_resized",
)
_INSERT_IMAGE = (
    "INSERT INTO public.invoice_scan_images (" + ", ".join(_IMAGE_COLUMNS) + ")"
    " VALUES (" + ", ".join(["%s"] * len(_IMAGE_COLUMNS)) + ")"
    " RETURNING id, " + ", ".join(_IMAGE_COLUMNS)
)


def ensure_open(scan: dict[str, Any] | None) -> None:
    if scan is None:
        raise _not_found()
    if scan["status"] != "uploaded":
        raise _locked()


def _check_scan_open(cur, scan_id: UUID) -> None:
    cur.execute("SELECT status FROM public.invoice_scans WHERE id = %s FOR UPDATE", (scan_id,))
    ensure_open(cur.fetchone())


def profile_and_scan(user_id: UUID, scan_id: UUID) -> tuple[dict[str, Any] | None, dict[str, Any] | None]:
    """The asking person's profile and the scan's status, in one question.
    Either may be missing; the caller decides what that means, in order."""
    with db.get_transaction() as cur:
        cur.execute(
            """
            SELECT p.id IS NOT NULL AS has_profile, p.full_name, p.role, p.is_active,
                   s.id IS NOT NULL AS has_scan, s.status
            FROM (SELECT %s::uuid AS user_id, %s::uuid AS scan_id) AS asked
            LEFT JOIN public.user_profiles p ON p.id = asked.user_id
            LEFT JOIN public.invoice_scans s ON s.id = asked.scan_id
            """,
            (user_id, scan_id),
        )
        row = cur.fetchone()
    profile = (
        {"full_name": row["full_name"], "role": row["role"], "is_active": row["is_active"]}
        if row["has_profile"] else None
    )
    scan = {"status": row["status"]} if row["has_scan"] else None
    return profile, scan


def _upload_both(storage, paths: dict[str, str], prepared: Prepared) -> None:
    """Both files at once (measured for a 264 KB pair: 351 ms one after the
    other, 212 ms side by side). Returns only when BOTH calls have ended, even
    when one fails at once, so nothing is still landing in the bucket when the
    caller cleans up. Then raises the first failure."""
    with ThreadPoolExecutor(max_workers=2, thread_name_prefix="scan-upload") as pool:
        futures = [
            pool.submit(storage.upload, paths[kind], stored.data, stored.content_type)
            for kind, stored in (("original", prepared.original), ("for_ai", prepared.for_ai))
        ]
    for future in futures:
        future.result()


def add_page(scan_id: UUID, data: bytes, label: str | None, actor_id: UUID,
             client_reported_resized: bool = False) -> dict[str, Any]:
    """The endpoint has already refused a scan that is missing or not open,
    before any shrinking, in the same database question as the user check
    (open_scan_for). The insert below checks again, under the row lock."""
    started = time.perf_counter()
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
    shrunk = time.perf_counter()
    try:
        _upload_both(storage, paths, prepared)
        stored_at = time.perf_counter()

        with db.get_transaction() as cur:
            _check_scan_open(cur, scan_id)
            cur.execute(
                "SELECT coalesce(max(page_no), 0) + 1 AS next FROM public.invoice_scan_images"
                " WHERE scan_id = %s",
                (scan_id,),
            )
            page_no = cur.fetchone()["next"]
            for kind, stored in (("original", prepared.original), ("for_ai", prepared.for_ai)):
                row = _row(scan_id, page_no, kind, paths[kind], stored, prepared, client_reported_resized)
                cur.execute(_INSERT_IMAGE, tuple(row[c] for c in _IMAGE_COLUMNS))
                inserted = cur.fetchone()
                write_audit(cur, IMAGE_TABLE, inserted["id"], "insert", None, inserted, actor_id)
    except BaseException:
        # Whatever failed, the files must not outlive the rows that would
        # have pointed at them. Both paths, always: a call that failed may
        # still have stored its file (a timeout after the bucket took it), and
        # removing a path that is not there succeeds.
        try:
            storage.remove(list(paths.values()))
        except AppError:
            logger.warning("Could not remove %d file(s) after a failed page upload", len(paths))
        raise

    # Where a slow page spent its time (D72: measured, not guessed). Sizes
    # and milliseconds only.
    logger.info(
        "Page stored: %d bytes in (phone says resized=%s), shrink %d ms, storage %d ms, database %d ms",
        prepared.source.bytes, client_reported_resized,
        (shrunk - started) * 1000, (stored_at - shrunk) * 1000, (time.perf_counter() - stored_at) * 1000,
    )
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


# --- the whole scan (6.4, left over from 6.2) --------------------------------

# Chat A 6.4: only a scan that never became a purchase. A rejected scan is
# kept as evidence (6.4 ข้อ 3), and one being read must finish first.
DELETABLE = ("uploaded", "needs_review", "failed")
_KEPT = {
    "converted": "ใบนี้สร้างใบรับสินค้าแล้ว ลบไม่ได้ เพราะเป็นหลักฐานของการรับสินค้า",
    "rejected": "ใบที่ปฏิเสธแล้วเก็บไว้เป็นหลักฐาน ลบไม่ได้",
    "extracting": "กำลังอ่านใบนี้อยู่ รอให้อ่านเสร็จก่อนแล้วค่อยลบ",
}


def delete_scan(scan_id: UUID, actor_id: UUID) -> dict[str, Any]:
    """Rows first, files after (as delete_page): a file left behind is only
    wasted space and is logged; a row left pointing at a deleted file would
    be a hole in the evidence. The audit row says who, when, how many pages."""
    with db.get_transaction() as cur:
        cur.execute(
            "SELECT id, status, created_at, created_by FROM public.invoice_scans WHERE id = %s FOR UPDATE",
            (scan_id,),
        )
        scan = cur.fetchone()
        if scan is None:
            raise _not_found()
        if scan["status"] not in DELETABLE:
            raise AppError("SCAN_NOT_DELETABLE", _KEPT.get(scan["status"], "ใบนี้ลบไม่ได้"), 409,
                           {"status": scan["status"]})
        cur.execute(
            "SELECT page_no, kind, storage_path FROM public.invoice_scan_images WHERE scan_id = %s",
            (scan_id,),
        )
        files = cur.fetchall()
        # The images go with the scan (ON DELETE CASCADE).
        cur.execute("DELETE FROM public.invoice_scans WHERE id = %s", (scan_id,))
        page_count = len({row["page_no"] for row in files})
        write_audit(
            cur, SCAN_TABLE, scan_id, "delete",
            {**scan, "page_count": page_count, "file_count": len(files)}, None, actor_id,
            reason=f"ลบทั้งใบ {page_count} หน้า",
        )

    files_removed = True
    if files:
        try:
            get_storage().remove([row["storage_path"] for row in files])
        except AppError:
            files_removed = False
            logger.warning("Scan removed but %d file(s) remain in the bucket", len(files))
    return {"id": scan_id, "page_count": page_count, "files_removed": files_removed}


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
