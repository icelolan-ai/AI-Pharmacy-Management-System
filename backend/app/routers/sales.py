"""Sales endpoints (spec 9.6). All roles; D11 price/discount rules apply to staff."""

from datetime import date
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Query

from app.auth import CurrentUser, get_current_user
from app.schemas.common import Page
from app.schemas.sale import SaleIn, SaleOut, SaleSummaryOut
from app.services import sales as sale_service

router = APIRouter(prefix="/api/v1/sales", tags=["sales"])

AnyRole = Annotated[CurrentUser, Depends(get_current_user)]


@router.post("", response_model=SaleOut, status_code=201)
def create_sale(body: SaleIn, user: AnyRole):
    return sale_service.create_sale(body, user)


@router.get("", response_model=Page[SaleSummaryOut])
def list_sales(
    user: AnyRole,
    date_from: date | None = None,
    date_to: date | None = None,
    limit: Annotated[int, Query(ge=1, le=200)] = 50,
    offset: Annotated[int, Query(ge=0)] = 0,
):
    return sale_service.list_sales(date_from=date_from, date_to=date_to, limit=limit, offset=offset)


@router.get("/{sale_id}", response_model=SaleOut)
def get_sale(sale_id: UUID, user: AnyRole):
    return sale_service.get_sale(sale_id)
