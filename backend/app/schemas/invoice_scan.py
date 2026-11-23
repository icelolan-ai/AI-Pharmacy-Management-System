"""Shapes of the invoice-scan answers (6.2).

A page shows only its original — the evidence copy a person checks. The
for_ai copy has no link anywhere in the API: nothing in the browser needs it.
"""

from datetime import datetime
from typing import Any, Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


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


class DeviceResizeOut(BaseModel):
    """D75: what the phone shrinks to before sending — the backend's own
    evidence-copy settings, so the numbers live in one place (config.py)."""

    max_edge_px: int
    jpeg_quality: int


class ScanDetailOut(BaseModel):
    id: UUID
    status: str
    # 6.4: what the reading came to, for the review page (ExtractOut has the
    # same three). Null until the scan has been read.
    failed_reason: str | None
    doc_kind: str | None
    extracted: dict[str, Any] | None
    # Who read it: a provider name, or "stand-in" — then the page says it is
    # a test invoice not read by AI (app/ai/stand_in.py).
    provider: str | None
    # 6.4: the review — the latest value of every touched field (the AI's
    # answer above is never changed), what still has to be touched, and
    # whether it was finished or rejected.
    corrections: list["CorrectionOut"]
    untouched: list[str]
    reviewed_at: datetime | None
    reviewed_by_name: str | None
    rejected_reason: str | None
    rejected_at: datetime | None
    created_at: datetime
    created_by: UUID | None
    created_by_name: str | None
    pages: list[ScanPageOut]
    url_expires_in_seconds: int
    device_resize: DeviceResizeOut


class ScanListItemOut(BaseModel):
    id: UUID
    status: str
    created_at: datetime
    created_by: UUID | None
    created_by_name: str | None
    page_count: int


class ExtractOut(BaseModel):
    """6.3: how a reading ended. `extracted` is the AI's answer as checked
    plus what our code made of it (docs/06-ai-design.md 2.4); null when the
    reading failed — failed_reason says why, never with values from the paper."""
    id: UUID
    status: str
    failed_reason: str | None
    doc_kind: str | None
    provider: str | None
    model: str | None
    prompt_version: str | None
    tokens_in: int | None
    tokens_out: int | None
    thinking_tokens: int | None
    cost_estimate_satang: int | None
    extracted: dict[str, Any] | None


class DeletedScanOut(BaseModel):
    """6.4: a whole scan gone. files_removed is false when the rows went but
    the bucket refused: the files are then wasted space, logged, never a hole."""
    id: UUID
    page_count: int
    files_removed: bool


class CorrectionOut(BaseModel):
    field_path: str
    shown_value: str | None
    person_value: str | None
    action: Literal["confirmed", "changed"]
    changed_at: datetime
    changed_by_name: str | None = None


class FieldIn(BaseModel):
    """6.4: a person touching one field. For "confirmed" the backend takes
    what it showed; person_value is only read for "changed"."""
    model_config = ConfigDict(extra="forbid")
    field_path: str
    action: Literal["confirmed", "changed"]
    person_value: str | None = None


class FieldOut(BaseModel):
    field_path: str
    shown_value: str | None
    person_value: str | None
    action: Literal["confirmed", "changed"]
    changed_at: datetime
    untouched: list[str]


class ReviewDoneOut(BaseModel):
    id: UUID
    status: str
    reviewed_at: datetime


class RejectIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    reason: str = Field(max_length=500)


class RejectedOut(BaseModel):
    id: UUID
    status: str
    rejected_reason: str
    rejected_at: datetime


ScanDetailOut.model_rebuild()


# --- 6.5: matching -------------------------------------------------------------

class ProposalOut(BaseModel):
    """One proposal and why (D52). The person chooses, always."""
    id: str
    name: str
    score: int
    reasons: list[str]
    from_memory: bool


class ChosenOut(BaseModel):
    id: str
    name: str | None
    action: Literal["confirmed", "changed"]
    changed_at: datetime
    changed_by_name: str | None


class ConflictOut(BaseModel):
    what: Literal["strength", "form"]
    paper: str
    system: str


class SupplierMatchOut(BaseModel):
    invoice_name: str | None
    proposals: list[ProposalOut]
    chosen: ChosenOut | None


class LineMatchOut(BaseModel):
    line_no: int
    name: str | None
    unit: str | None
    free_goods: bool
    proposals: list[ProposalOut]
    note: str | None
    chosen: ChosenOut | None
    # Where the chosen medicine contradicts the paper — chosen anyway, after
    # a second confirmation (Chat A ข.).
    conflicts: list[ConflictOut]


class MatchesOut(BaseModel):
    scan_id: UUID
    supplier: SupplierMatchOut
    lines: list[LineMatchOut]
    ready: bool


class ChooseIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    target: Literal["supplier", "line"]
    chosen_id: UUID
    line_no: int | None = Field(default=None, ge=1)
    confirm_conflict: bool = False
