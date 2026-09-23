"""Report endpoints (spec 9.7). staff never receives value fields."""

from typing import Annotated

from fastapi import APIRouter, Depends, Query

from app.auth import CurrentUser, get_current_user, require_roles
from app.schemas.common import Page
from app.schemas.report import (
    ExpiredLotOut,
    ExpiredLotWithValueOut,
    ExpiringReportOut,
    ExpiringReportWithValueOut,
    InventoryValueOut,
    LowStockRowOut,
    SalesTimeseriesOut,
    StockRowOut,
    StockRowWithValueOut,
)
from app.services import reports as report_service
from app.services import sales_timeseries as timeseries_service
from app.visibility import role_json

router = APIRouter(prefix="/api/v1/reports", tags=["reports"])

AnyRole = Annotated[CurrentUser, Depends(get_current_user)]
Manager = Annotated[CurrentUser, Depends(require_roles("owner", "pharmacist"))]
Owner = Annotated[CurrentUser, Depends(require_roles("owner"))]
Limit = Annotated[int, Query(ge=1, le=200)]
Offset = Annotated[int, Query(ge=0)]


@router.get("/stock", response_model=Page[StockRowWithValueOut], description="staff: *_value omitted.")
def stock(
    user: AnyRole,
    q: Annotated[str | None, Query(max_length=200)] = None,
    category: Annotated[str | None, Query(max_length=200)] = None,
    limit: Limit = 50,
    offset: Offset = 0,
):
    data = report_service.stock_report(q=q, category=category, limit=limit, offset=offset)
    return role_json(user, data, Page[StockRowOut], Page[StockRowWithValueOut])


@router.get("/expiring", response_model=ExpiringReportWithValueOut, description="staff: stock_value omitted.")
def expiring(
    user: AnyRole,
    days: Annotated[int, Query(ge=1, le=3650)] = 180,
    limit: Limit = 50,
    offset: Offset = 0,
):
    data = report_service.expiring_report(days=days, limit=limit, offset=offset)
    return role_json(user, data, ExpiringReportOut, ExpiringReportWithValueOut)


@router.get("/expired", response_model=Page[ExpiredLotWithValueOut], description="staff: stock_value omitted.")
def expired(user: AnyRole, limit: Limit = 50, offset: Offset = 0):
    data = report_service.expired_report(limit=limit, offset=offset)
    return role_json(user, data, Page[ExpiredLotOut], Page[ExpiredLotWithValueOut])


@router.get("/low-stock", response_model=Page[LowStockRowOut])
def low_stock(user: AnyRole, limit: Limit = 50, offset: Offset = 0):
    return report_service.low_stock_report(limit=limit, offset=offset)


@router.get("/inventory-value", response_model=InventoryValueOut)
def inventory_value(user: Owner, limit: Limit = 50, offset: Offset = 0):
    return report_service.inventory_value_report(limit=limit, offset=offset)


@router.get("/sales-timeseries", response_model=SalesTimeseriesOut)
def sales_timeseries(
    user: Manager,
    days: Annotated[int, Query(ge=1, le=365)] = 30,
):
    """ยอดขายรายวันย้อนหลัง (U-7 Line).

    owner + pharmacist เท่านั้น เหมือนหน้ารายงานอื่น ๆ (D32/D33 กั้นที่ระดับ
    endpoint). Days with no sales are returned as zero rather than omitted.
    """
    return timeseries_service.sales_timeseries(days=days)
