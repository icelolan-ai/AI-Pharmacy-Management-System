"""Purchases (receiving) endpoints (spec 9.5). owner and pharmacist only."""

from datetime import date
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Query

from app.auth import CurrentUser, require_roles
from app.schemas.common import Page
from app.schemas.purchase import (
    ConfirmOut,
    DeletedOut,
    PurchaseIn,
    PurchaseOut,
    PurchaseStatus,
    PurchaseSummaryOut,
)
from app.services import purchases as purchase_service

router = APIRouter(prefix="/api/v1/purchases", tags=["purchases"])

Manager = Annotated[CurrentUser, Depends(require_roles("owner", "pharmacist"))]


@router.post("", response_model=PurchaseOut, status_code=201)
def create_purchase(body: PurchaseIn, user: Manager):
    return purchase_service.create_purchase(body, user.id)


@router.get("", response_model=Page[PurchaseSummaryOut])
def list_purchases(
    user: Manager,
    status: PurchaseStatus | None = None,
    supplier_id: UUID | None = None,
    date_from: date | None = None,
    date_to: date | None = None,
    limit: Annotated[int, Query(ge=1, le=200)] = 50,
    offset: Annotated[int, Query(ge=0)] = 0,
):
    return purchase_service.list_purchases(
        status=status,
        supplier_id=supplier_id,
        date_from=date_from,
        date_to=date_to,
        limit=limit,
        offset=offset,
    )


@router.get("/{purchase_id}", response_model=PurchaseOut)
def get_purchase(purchase_id: UUID, user: Manager):
    return purchase_service.get_purchase(purchase_id)


@router.put("/{purchase_id}", response_model=PurchaseOut)
def update_purchase(purchase_id: UUID, body: PurchaseIn, user: Manager):
    return purchase_service.update_purchase(purchase_id, body, user.id)


@router.post("/{purchase_id}/confirm", response_model=ConfirmOut)
def confirm_purchase(purchase_id: UUID, user: Manager):
    return purchase_service.confirm_purchase(purchase_id, user.id)


@router.delete("/{purchase_id}", response_model=DeletedOut)
def delete_purchase(purchase_id: UUID, user: Manager):
    return purchase_service.delete_purchase(purchase_id, user.id)
