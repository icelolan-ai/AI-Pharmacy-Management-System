from datetime import date, datetime
from typing import Annotated, Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from app.schemas.common import MoneyOut

AdjustmentType = Literal["adjustment", "damage", "expired", "return", "correction"]
MAX_ADJUSTMENT = 100000


class LotOut(BaseModel):
    """Lot as seen by every role (no cost)."""

    id: UUID
    medicine_id: UUID
    medicine_name: str | None
    lot_number: str
    supplier_id: UUID | None
    quantity_received: int
    quantity_remaining: int
    expiry_date: date
    received_date: date
    status: str | None
    days_remaining: int
    sellable: bool


class LotWithCostOut(LotOut):
    """owner / pharmacist only."""

    cost_per_unit: MoneyOut


class LotTransactionOut(BaseModel):
    id: UUID
    medicine_lot_id: UUID
    transaction_type: str
    quantity_change: int
    quantity_before: int
    quantity_after: int
    reference_type: str | None
    reference_id: UUID | None
    notes: str | None
    created_by: UUID | None
    created_at: datetime


class AdjustmentIn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    transaction_type: AdjustmentType
    quantity_change: int
    # D23: what the screen showed when the dialog was opened. Optional so older
    # clients keep working; when sent it must still match the lot -> 409.
    quantity_before: Annotated[int, Field(ge=0)] | None = None
    reason: Annotated[str, Field(min_length=1, max_length=500)]

    @field_validator("reason", mode="before")
    @classmethod
    def _strip_reason(cls, value):
        return value.strip() if isinstance(value, str) else value

    @field_validator("quantity_change")
    @classmethod
    def _change_range(cls, value: int) -> int:
        if value == 0:
            raise ValueError("quantity_change must not be 0")
        if abs(value) > MAX_ADJUSTMENT:
            raise ValueError(f"|quantity_change| must be <= {MAX_ADJUSTMENT}")
        return value

    @model_validator(mode="after")
    def _loss_types_are_negative(self):
        if self.transaction_type in ("damage", "expired") and self.quantity_change > 0:
            raise ValueError(f"{self.transaction_type} must be a negative quantity_change")
        return self


class AdjustmentOut(LotWithCostOut):
    transaction_id: UUID
