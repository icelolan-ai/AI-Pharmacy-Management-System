"""Lot endpoints (spec 9.4): lot views, lot transactions, stock adjustments.

fefo-preview lives in routers/medicines.py (task 3.8).
"""

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Query

from app.auth import CurrentUser, get_current_user, require_roles
from app.schemas.common import Page
from app.schemas.lot import AdjustmentIn, AdjustmentOut, LotOut, LotTransactionOut, LotWithCostOut
from app.services import lots as lot_service
from app.visibility import role_json

router = APIRouter(prefix="/api/v1", tags=["lots"])

AnyRole = Annotated[CurrentUser, Depends(get_current_user)]
Manager = Annotated[CurrentUser, Depends(require_roles("owner", "pharmacist"))]


@router.get(
    "/medicines/{medicine_id}/lots",
    response_model=Page[LotWithCostOut],
    description="FEFO order. staff: cost_per_unit is omitted.",
)
def list_medicine_lots(
    medicine_id: UUID,
    user: AnyRole,
    include_inactive: bool = False,
    limit: Annotated[int, Query(ge=1, le=200)] = 50,
    offset: Annotated[int, Query(ge=0)] = 0,
):
    data = lot_service.list_medicine_lots(
        medicine_id, include_inactive=include_inactive, limit=limit, offset=offset
    )
    return role_json(user, data, Page[LotOut], Page[LotWithCostOut])


@router.get(
    "/lots/{lot_id}",
    response_model=LotWithCostOut,
    description="staff: cost_per_unit is omitted.",
)
def get_lot(lot_id: UUID, user: AnyRole):
    return role_json(user, lot_service.get_lot(lot_id), LotOut, LotWithCostOut)


@router.get("/lots/{lot_id}/transactions", response_model=Page[LotTransactionOut])
def list_lot_transactions(
    lot_id: UUID,
    user: Manager,
    limit: Annotated[int, Query(ge=1, le=200)] = 50,
    offset: Annotated[int, Query(ge=0)] = 0,
):
    return lot_service.list_lot_transactions(lot_id, limit=limit, offset=offset)


@router.post("/lots/{lot_id}/adjustments", response_model=AdjustmentOut, status_code=201)
def adjust_lot(lot_id: UUID, body: AdjustmentIn, user: Manager):
    return lot_service.adjust_lot(lot_id, body, user)
