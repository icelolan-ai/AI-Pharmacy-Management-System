from datetime import date, datetime
from decimal import Decimal
from typing import Annotated, Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from app.schemas.common import MoneyIn, MoneyOut, blank_to_none

PurchaseStatus = Literal["draft", "confirmed", "discrepancy"]


class PurchaseItemIn(BaseModel):
    # extra="forbid": subtotal, id, purchase_id ... from the client -> 400
    model_config = ConfigDict(extra="forbid")

    medicine_id: UUID
    quantity_invoiced: Annotated[int, Field(ge=0)]
    quantity_actual: Annotated[int, Field(ge=0)] | None = None
    unit_cost: MoneyIn
    lot_number: Annotated[str, Field(min_length=1)]
    expiry_date: date

    @field_validator("lot_number", mode="before")
    @classmethod
    def _strip_lot(cls, value):
        return value.strip() if isinstance(value, str) else value

    @model_validator(mode="after")
    def _some_quantity(self):
        if self.quantity_invoiced <= 0 and not (self.quantity_actual or 0) > 0:
            raise ValueError("quantity_invoiced or quantity_actual must be greater than 0")
        return self


class PurchaseIn(BaseModel):
    """Body for POST and PUT (PUT replaces everything). Totals are computed by the backend."""

    model_config = ConfigDict(extra="forbid")

    supplier_id: UUID
    purchase_date: date
    # D28: เลขที่ใบส่งของ. Optional while the purchase is a draft; confirm
    # refuses without it.
    invoice_no: str | None = None
    discount_amount: MoneyIn = Decimal("0.00")
    tax_amount: MoneyIn = Decimal("0.00")
    items: Annotated[list[PurchaseItemIn], Field(min_length=1, max_length=200)]

    @field_validator("invoice_no", mode="after")
    @classmethod
    def _blank_invoice_to_none(cls, value):
        return blank_to_none(value)


class PurchaseItemOut(BaseModel):
    id: UUID
    medicine_id: UUID
    medicine_name: str | None
    # Carried with the line for the same reason as medicine_name: whoever
    # reopens a draft is counting real boxes, and "18" means nothing without
    # knowing 18 of what.
    unit: str | None
    quantity_invoiced: int
    quantity_actual: int | None
    unit_cost: MoneyOut
    lot_number: str
    expiry_date: date
    subtotal: MoneyOut


class PurchaseLotOut(BaseModel):
    id: UUID
    purchase_item_id: UUID | None
    medicine_id: UUID
    lot_number: str
    quantity_received: int
    quantity_remaining: int
    cost_per_unit: MoneyOut
    expiry_date: date
    received_date: date
    status: str | None


class PurchaseOut(BaseModel):
    id: UUID
    # D29: เลขที่ใบรับสินค้า R-YYMMDD-NNN — null while still a draft.
    purchase_no: str | None
    invoice_no: str | None
    supplier_id: UUID
    supplier_name: str | None
    purchase_date: date
    items_subtotal: MoneyOut
    discount_amount: MoneyOut
    tax_amount: MoneyOut
    total_amount: MoneyOut
    status: PurchaseStatus
    created_by: UUID | None
    # D30: who received the goods, from purchases.created_by — never the reader.
    created_by_name: str | None
    created_at: datetime
    # D30: when the goods were counted in; the A4 note prints this, not created_at.
    confirmed_at: datetime | None
    items: list[PurchaseItemOut]
    lots: list[PurchaseLotOut]


class PurchaseSummaryOut(BaseModel):
    id: UUID
    purchase_no: str | None
    invoice_no: str | None
    supplier_id: UUID
    supplier_name: str | None
    purchase_date: date
    total_amount: MoneyOut
    status: PurchaseStatus
    item_count: int
    created_at: datetime


class ConfirmedLotOut(BaseModel):
    id: UUID
    medicine_id: UUID
    lot_number: str
    quantity: int
    expiry_date: date


class DiscrepancyOut(BaseModel):
    medicine_id: UUID
    lot_number: str
    invoiced: int
    actual: int


class ConfirmOut(BaseModel):
    purchase_id: UUID
    purchase_no: str
    status: Literal["confirmed", "discrepancy"]
    confirmed_at: datetime
    lots: list[ConfirmedLotOut]
    discrepancies: list[DiscrepancyOut]


class DeletedOut(BaseModel):
    id: UUID
    deleted: bool
