"""Suppliers endpoints (spec 9.3). owner and pharmacist only."""

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Query

from app.auth import CurrentUser, require_roles
from app.schemas.common import Page
from app.schemas.supplier import SupplierCreate, SupplierOut, SupplierUpdate
from app.services import suppliers as supplier_service

router = APIRouter(prefix="/api/v1/suppliers", tags=["suppliers"])

Manager = Annotated[CurrentUser, Depends(require_roles("owner", "pharmacist"))]


@router.get("", response_model=Page[SupplierOut])
def list_suppliers(
    user: Manager,
    q: Annotated[str | None, Query(max_length=200)] = None,
    limit: Annotated[int, Query(ge=1, le=200)] = 50,
    offset: Annotated[int, Query(ge=0)] = 0,
):
    return supplier_service.list_suppliers(q=q, limit=limit, offset=offset)


@router.get("/{supplier_id}", response_model=SupplierOut)
def get_supplier(supplier_id: UUID, user: Manager):
    return supplier_service.get_supplier(supplier_id)


@router.post("", response_model=SupplierOut, status_code=201)
def create_supplier(body: SupplierCreate, user: Manager):
    return supplier_service.create_supplier(body, user.id)


@router.patch("/{supplier_id}", response_model=SupplierOut)
def update_supplier(supplier_id: UUID, body: SupplierUpdate, user: Manager):
    return supplier_service.update_supplier(supplier_id, body, user.id)
