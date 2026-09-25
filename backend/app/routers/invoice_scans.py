"""ถ่ายรูปใบส่งของ (6.2) endpoints.

For whoever receives stock: owner and pharmacist, the same as purchases.

A page is sent as the request body itself (Content-Type image/jpeg etc.),
not as a multipart form: one file per request, and the body can be read in
chunks and cut off the moment it passes MAX_UPLOAD_BYTES (D72) — before it
is all in memory. The Content-Type label is kept only for the log; what the
file is gets decided from its bytes (D69).
"""

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Request, Response, status
from fastapi.concurrency import run_in_threadpool

from app.auth import CurrentUser, require_roles
from app.config import get_settings
from app.errors import AppError
from app.schemas.invoice_scan import PageOut, ScanDetailOut, ScanListItemOut
from app.services import invoice_scans as service

router = APIRouter(prefix="/api/v1/invoice-scans", tags=["invoice-scans"])

Manager = Annotated[CurrentUser, Depends(require_roles("owner", "pharmacist"))]


async def read_limited_body(request: Request, limit: int) -> bytes:
    """The body, or 413 as soon as it passes `limit` — whether or not the
    client told the truth in Content-Length."""
    declared = request.headers.get("content-length")
    if declared is not None and declared.isdigit() and int(declared) > limit:
        raise service.upload_too_large()
    chunks: list[bytes] = []
    received = 0
    async for chunk in request.stream():
        received += len(chunk)
        if received > limit:
            raise service.upload_too_large()
        chunks.append(chunk)
    return b"".join(chunks)


@router.post("", response_model=ScanDetailOut, status_code=status.HTTP_201_CREATED)
def post_scan(user: Manager):
    return service.create_scan(user.id)


@router.get("", response_model=list[ScanListItemOut])
def get_scans(user: Manager):
    return service.list_scans()


@router.get("/{scan_id}", response_model=ScanDetailOut)
def get_scan(scan_id: UUID, user: Manager):
    return service.get_scan(scan_id)


@router.post("/{scan_id}/pages", response_model=PageOut, status_code=status.HTTP_201_CREATED)
async def post_page(scan_id: UUID, request: Request, user: Manager):
    data = await read_limited_body(request, get_settings().max_upload_bytes)
    if not data:
        raise AppError("EMPTY_UPLOAD", "ไม่ได้ส่งรูปมา ลองถ่ายใหม่อีกครั้ง", 400)
    label = request.headers.get("content-type")
    # Shrinking and the database are blocking work; keep them off the loop.
    return await run_in_threadpool(service.add_page, scan_id, data, label, user.id)


@router.delete("/{scan_id}/pages/{page_no}", status_code=status.HTTP_204_NO_CONTENT)
def delete_page(scan_id: UUID, page_no: int, user: Manager):
    service.delete_page(scan_id, page_no, user.id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
