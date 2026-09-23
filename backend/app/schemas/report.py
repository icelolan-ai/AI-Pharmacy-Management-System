"""Report schemas. Public models have no cost/value fields; *WithValue models add them
for owner / pharmacist (spec 7.2)."""

from datetime import date
from uuid import UUID

from pydantic import BaseModel

from app.schemas.common import MoneyOut, Page


class StockRowOut(BaseModel):
    medicine_id: UUID
    name: str
    strength: str | None
    category: str | None
    unit: str
    available_quantity: int
    expired_quantity: int
    reorder_point: int | None
    lot_count: int
    # The sellable lot that expires first; null when nothing sellable is left.
    nearest_expiry: date | None
    days_remaining: int | None  # raw value (D19): the web shows this minus 1
    risk_level: str | None


class StockRowWithValueOut(StockRowOut):
    available_value: MoneyOut
    expired_value: MoneyOut


class ExpiringLotOut(BaseModel):
    lot_id: UUID
    medicine_id: UUID
    medicine_name: str
    unit: str
    lot_number: str
    quantity_remaining: int
    expiry_date: date
    days_remaining: int
    risk_level: str


class ExpiringLotWithValueOut(ExpiringLotOut):
    stock_value: MoneyOut


class RiskSummaryOut(BaseModel):
    lot_count: int


class RiskSummaryWithValueOut(RiskSummaryOut):
    stock_value: MoneyOut


class ExpiringReportOut(Page[ExpiringLotOut]):
    summary: dict[str, RiskSummaryOut]


class ExpiringReportWithValueOut(Page[ExpiringLotWithValueOut]):
    summary: dict[str, RiskSummaryWithValueOut]


class ExpiredLotOut(BaseModel):
    lot_id: UUID
    medicine_id: UUID
    medicine_name: str
    unit: str
    lot_number: str
    quantity_remaining: int
    expiry_date: date
    days_expired: int


class ExpiredLotWithValueOut(ExpiredLotOut):
    stock_value: MoneyOut


class LowStockRowOut(BaseModel):
    medicine_id: UUID
    name: str
    unit: str
    available_quantity: int
    reorder_point: int
    shortage: int


class ValueBreakdown(BaseModel):
    total_value: MoneyOut
    sellable_value: MoneyOut
    expired_value: MoneyOut


class MedicineValueOut(ValueBreakdown):
    medicine_id: UUID
    name: str


class CategoryValueOut(ValueBreakdown):
    category: str


class InventoryValueOut(ValueBreakdown):
    by_medicine: Page[MedicineValueOut]
    by_category: list[CategoryValueOut]


class SalesDayOut(BaseModel):
    """One business day on the sales line (D9: Asia/Bangkok, not CURRENT_DATE)."""

    date: date
    sale_count: int
    total_amount: MoneyOut


class SalesTimeseriesOut(BaseModel):
    """Every day in the window, including the ones with no sales at all.

    The zero days are returned rather than left out: a line drawn from a list
    with gaps in it slopes straight through a closed day and tells the owner
    they sold something they did not.
    """

    date_from: date
    date_to: date
    days: list[SalesDayOut]
    total_amount: MoneyOut
    busiest_day: date | None
