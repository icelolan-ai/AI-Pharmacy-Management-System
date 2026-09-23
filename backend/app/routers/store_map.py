"""ผังร้าน (U-8) endpoints.

Reading is open to every signed-in role: a cashier needs to find where a
medicine sits. Editing is the owner's alone, the same rule as the shop's own
details.

Nothing here carries cost or value. The map answers where things are; what
they are worth stays behind the endpoints that already guard it (D32/D33).
"""

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Response, status

from app.auth import CurrentUser, get_current_user, require_roles
from app.schemas.store_map import (
    PointCreate,
    PointOut,
    PointUpdate,
    ShapeCreate,
    ShapeOut,
    ShapeUpdate,
    StoreMapOut,
    StoreMapUpsert,
    StoreMapViewOut,
)
from app.services import store_map as store_map_service

router = APIRouter(prefix="/api/v1/store-map", tags=["store-map"])

AnyRole = Annotated[CurrentUser, Depends(get_current_user)]
Owner = Annotated[CurrentUser, Depends(require_roles("owner"))]


@router.get("", response_model=StoreMapViewOut)
def get_store_map(user: AnyRole):
    """Map, shapes and points in one answer. Never 404: a shop with no map
    gets `map: null`, and the page says so in words."""
    return store_map_service.get_store_map_view()


@router.put("", response_model=StoreMapOut)
def put_store_map(body: StoreMapUpsert, user: Owner):
    """Create the map, or rename and resize it."""
    return store_map_service.upsert_store_map(body, user.id)


@router.post("/shapes", response_model=ShapeOut, status_code=status.HTTP_201_CREATED)
def post_shape(body: ShapeCreate, user: Owner):
    return store_map_service.create_shape(body, user.id)


@router.patch("/shapes/{shape_id}", response_model=ShapeOut)
def patch_shape(shape_id: UUID, body: ShapeUpdate, user: Owner):
    return store_map_service.update_shape(shape_id, body, user.id)


@router.delete("/shapes/{shape_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_shape(shape_id: UUID, user: Owner):
    store_map_service.delete_shape(shape_id, user.id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/points", response_model=PointOut, status_code=status.HTTP_201_CREATED)
def post_point(body: PointCreate, user: Owner):
    return store_map_service.create_point(body, user.id)


@router.patch("/points/{point_id}", response_model=PointOut)
def patch_point(point_id: UUID, body: PointUpdate, user: Owner):
    return store_map_service.update_point(point_id, body, user.id)


@router.delete("/points/{point_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_point(point_id: UUID, user: Owner):
    store_map_service.delete_point(point_id, user.id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
