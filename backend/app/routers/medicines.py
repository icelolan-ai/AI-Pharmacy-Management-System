"""Medicines endpoints (spec 9.2). No DELETE: deactivate with is_active=false."""

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Query

from app.auth import CurrentUser, get_current_user, require_roles
from app.schemas.common import Page
from app.schemas.medicine import MedicineCreate, MedicineOut, MedicineUpdate
from app.schemas.sale import FefoPreviewOut
from app.services import fefo as fefo_service
from app.services import medicines as medicine_service

router = APIRouter(prefix="/api/v1/medicines", tags=["medicines"])

AnyRole = Annotated[CurrentUser, Depends(get_current_user)]
Manager = Annotated[CurrentUser, Depends(require_roles("owner", "pharmacist"))]


@router.get("", response_model=Page[MedicineOut])
def list_medicines(
    user: AnyRole,
    q: Annotated[str | None, Query(max_length=200)] = None,
    category: Annotated[str | None, Query(max_length=200)] = None,
    is_active: bool = True,
    limit: Annotated[int, Query(ge=1, le=200)] = 50,
    offset: Annotated[int, Query(ge=0)] = 0,
):
    return medicine_service.list_medicines(
        q=q, category=category, is_active=is_active, limit=limit, offset=offset
    )


@router.get("/by-barcode/{barcode}", response_model=MedicineOut)
def get_medicine_by_barcode(barcode: str, user: AnyRole):
    return medicine_service.get_medicine_by_barcode(barcode)


@router.get("/{medicine_id}", response_model=MedicineOut)
def get_medicine(medicine_id: UUID, user: AnyRole):
    return medicine_service.get_medicine(medicine_id)


@router.get("/{medicine_id}/fefo-preview", response_model=FefoPreviewOut)
def fefo_preview(
    medicine_id: UUID,
    user: AnyRole,
    quantity: Annotated[int, Query(gt=0, le=100000)],
):
    """Read-only: which lots a sale of `quantity` would cut (no locks, nothing saved)."""
    return fefo_service.preview(medicine_id, quantity)


@router.post("", response_model=MedicineOut, status_code=201)
def create_medicine(body: MedicineCreate, user: Manager):
    return medicine_service.create_medicine(body, user.id)


@router.patch("/{medicine_id}", response_model=MedicineOut)
def update_medicine(medicine_id: UUID, body: MedicineUpdate, user: Manager):
    return medicine_service.update_medicine(medicine_id, body, user.id)
