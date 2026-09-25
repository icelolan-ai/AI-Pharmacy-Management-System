"""Shapes of the invoice-scan answers (6.2).

A page shows only its original — the evidence copy a person checks. The
for_ai copy has no link anywhere in the API: nothing in the browser needs it.
"""

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel


class PageOut(BaseModel):
    page_no: int
    width_px: int
    height_px: int
    bytes: int
    reencoded: bool
    source_bytes: int


class ScanPageOut(BaseModel):
    page_no: int
    # Signed, short-lived, made fresh on every read. Never stored.
    image_url: str
    width_px: int
    height_px: int
    bytes: int
    reencoded: bool
    source_content_type: str
    source_bytes: int
    source_width_px: int
    source_height_px: int
    uploaded_at: datetime


class ScanDetailOut(BaseModel):
    id: UUID
    status: str
    created_at: datetime
    created_by: UUID | None
    created_by_name: str | None
    pages: list[ScanPageOut]
    url_expires_in_seconds: int


class ScanListItemOut(BaseModel):
    id: UUID
    status: str
    created_at: datetime
    created_by: UUID | None
    created_by_name: str | None
    page_count: int
