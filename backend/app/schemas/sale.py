from datetime import date, datetime
from decimal import Decimal
from typing import Annotated
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from app.schemas.common import MoneyIn, MoneyOut


class SaleItemIn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    medicine_id: UUID
    quantity: Annotated[int, Field(gt=0)]
    unit_price: MoneyIn | None = None


class SaleIn(BaseModel):
    # extra="forbid": subtotal, total_amount, tax_amount, sale_date, created_by -> 400
    model_config = ConfigDict(extra="forbid")

    discount_amount: MoneyIn = Decimal("0.00")
    items: Annotated[list[SaleItemIn], Field(min_length=1, max_length=100)]


class SaleItemOut(BaseModel):
    medicine_id: UUID
    medicine_name: str | None
    lot_id: UUID
    lot_number: str
    expiry_date: date
    quantity: int
    unit_price: MoneyOut
    subtotal: MoneyOut


class SaleOut(BaseModel):
    id: UUID
    # D26: เลขที่บิล S-YYMMDD-NNN (Buddhist year, running per business day).
    sale_no: str
    sale_date: datetime
    discount_amount: MoneyOut
    tax_amount: MoneyOut
    total_amount: MoneyOut
    # D27: who rang the sale, read from sales.created_by — never the person
    # who happens to be printing. null when that account has no profile.
    sold_by_name: str | None
    items: list[SaleItemOut]


class SaleSummaryOut(BaseModel):
    id: UUID
    sale_no: str
    sale_date: datetime
    discount_amount: MoneyOut
    tax_amount: MoneyOut
    total_amount: MoneyOut


class FefoAllocationOut(BaseModel):
    lot_id: UUID
    lot_number: str
    expiry_date: date
    quantity: int


class FefoPreviewOut(BaseModel):
    medicine_id: UUID
    requested: int
    available: int
    sufficient: bool
    allocations: list[FefoAllocationOut]
