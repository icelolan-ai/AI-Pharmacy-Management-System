"""Store profile endpoints (ข้อมูลร้าน). No DELETE: the shop always has a profile."""

from typing import Annotated

from fastapi import APIRouter, Depends

from app.auth import CurrentUser, get_current_user, require_roles
from app.schemas.store import StoreProfileOut, StoreProfileUpdate
from app.services import store as store_service

router = APIRouter(prefix="/api/v1/store", tags=["store"])

AnyRole = Annotated[CurrentUser, Depends(get_current_user)]
Owner = Annotated[CurrentUser, Depends(require_roles("owner"))]


@router.get("", response_model=StoreProfileOut)
def get_store(user: AnyRole):
    """Every signed-in role may read it. Never 404: an unsaved profile is all null."""
    return store_service.get_store_profile()


@router.patch("", response_model=StoreProfileOut)
def update_store(body: StoreProfileUpdate, user: Owner):
    """Owner only. The first save creates the row and requires a shop name."""
    return store_service.update_store_profile(body, user.id)
