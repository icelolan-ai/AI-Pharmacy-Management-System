"""Role-based field visibility: staff must never receive cost or value fields (spec 7.2).

Endpoints that differ by role return a JSONResponse built from the role's model, so
manager-only fields are absent from the staff payload (not just null).
"""

from typing import Any

from fastapi.responses import JSONResponse
from pydantic import BaseModel

from app.auth import CurrentUser

COST_ROLES = frozenset({"owner", "pharmacist"})


def can_view_cost(user: CurrentUser) -> bool:
    return user.role in COST_ROLES


def role_json(
    user: CurrentUser,
    data: Any,
    public_model: type[BaseModel],
    manager_model: type[BaseModel],
    status_code: int = 200,
) -> JSONResponse:
    model = manager_model if can_view_cost(user) else public_model
    return JSONResponse(
        status_code=status_code,
        content=model.model_validate(data).model_dump(mode="json"),
    )
