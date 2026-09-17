"""GET /api/v1/me — the signed-in user's profile and role."""

from typing import Annotated

from fastapi import APIRouter, Depends

from app.auth import CurrentUser, get_current_user
from app.schemas.user import MeResponse

router = APIRouter(prefix="/api/v1", tags=["auth"])


@router.get("/me", response_model=MeResponse)
def read_me(user: Annotated[CurrentUser, Depends(get_current_user)]) -> MeResponse:
    return MeResponse(
        id=user.id, email=user.email, full_name=user.full_name, role=user.role
    )
