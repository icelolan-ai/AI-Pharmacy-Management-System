"""ผังร้าน (U-8) — schemas for the map, the things in the room, and the marks.

The map is an optional way to fill a field. Nothing in the main flow (scan →
receive → sell) depends on any of this.

Units are real millimetres as integers throughout, origin at the room's
top-left corner, x to the right and y downwards. 2D and 2.5D read the same
numbers; only `height_z_mm` is extra, and only the tilted view uses it.
"""

from datetime import datetime
from typing import Annotated, Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.schemas.common import blank_to_none

# The room is measured in millimetres, so 100 m is a generous ceiling for a
# pharmacy and still far from anything that could overflow an int.
MAX_MM = 100_000

# Enforced here rather than in the database: a constraint that counts the rows
# on every insert gets slower as the map fills up.
MAX_POINTS = 1000
MAX_SHAPES = 200

SHAPE_KINDS = ("wall_shelf", "shelf", "pillar", "counter", "door", "room", "other")
ShapeKind = Literal["wall_shelf", "shelf", "pillar", "counter", "door", "room", "other"]

Mm = Annotated[int, Field(ge=0, le=MAX_MM)]
SizeMm = Annotated[int, Field(ge=1, le=MAX_MM)]
RoomMm = Annotated[int, Field(ge=100, le=MAX_MM)]
Label = Annotated[str, Field(min_length=1, max_length=80)]


class StoreMapUpsert(BaseModel):
    """Create the shop's map, or change its name and size."""

    model_config = ConfigDict(extra="forbid")

    name: Label
    width_mm: RoomMm
    height_mm: RoomMm


class ShapeCreate(BaseModel):
    """One rectangle in the room: a shelf, the counter, a pillar, a door.

    Rectangles only (กฎ 66). An L shape is two of these; a free polygon would
    need its own table of corners, which nothing in this shop needs yet.
    """

    model_config = ConfigDict(extra="forbid")

    kind: ShapeKind
    # D34: everything on the map carries a name in words. Colour and position
    # are never the only way to tell one thing from another.
    label: Label
    x_mm: Mm
    y_mm: Mm
    width_mm: SizeMm
    height_mm: SizeMm
    rotation_deg: Annotated[int, Field(ge=0, le=359)] = 0
    height_z_mm: Annotated[int, Field(ge=0, le=10_000)] = 0
    sort_order: Annotated[int, Field(ge=0, le=9999)] = 0


class ShapeUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    kind: ShapeKind | None = None
    label: Label | None = None
    x_mm: Mm | None = None
    y_mm: Mm | None = None
    width_mm: SizeMm | None = None
    height_mm: SizeMm | None = None
    rotation_deg: Annotated[int, Field(ge=0, le=359)] | None = None
    height_z_mm: Annotated[int, Field(ge=0, le=10_000)] | None = None
    sort_order: Annotated[int, Field(ge=0, le=9999)] | None = None


class PointCreate(BaseModel):
    """A mark on the map. `code` is the short label drawn beside the dot; the
    full name lives in the list next to the drawing, because D45 allows no
    text inside an <svg>."""

    model_config = ConfigDict(extra="forbid")

    code: Annotated[str, Field(min_length=1, max_length=8)]
    name: Label
    detail: Annotated[str, Field(max_length=500)] | None = None
    x_mm: Mm
    y_mm: Mm

    @field_validator("detail", mode="after")
    @classmethod
    def _blank_to_none(cls, value):
        return blank_to_none(value)


class PointUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    code: Annotated[str, Field(min_length=1, max_length=8)] | None = None
    name: Label | None = None
    detail: Annotated[str, Field(max_length=500)] | None = None
    x_mm: Mm | None = None
    y_mm: Mm | None = None

    @field_validator("detail", mode="after")
    @classmethod
    def _blank_to_none(cls, value):
        return blank_to_none(value)


class ShapeOut(BaseModel):
    id: UUID
    map_id: UUID
    kind: str
    label: str
    x_mm: int
    y_mm: int
    width_mm: int
    height_mm: int
    rotation_deg: int
    height_z_mm: int
    sort_order: int


class PointOut(BaseModel):
    id: UUID
    map_id: UUID
    code: str
    name: str
    detail: str | None
    x_mm: int
    y_mm: int
    # How many medicines are marked here. Counted by the database, never added
    # up in the browser.
    medicine_count: int


class StoreMapOut(BaseModel):
    id: UUID
    name: str
    width_mm: int
    height_mm: int
    updated_at: datetime | None
    updated_by: UUID | None
    updated_by_name: str | None


class StoreMapViewOut(BaseModel):
    """Everything the map page needs, in one answer.

    `map` is null when the shop has not drawn one — never a 404. The page then
    says so in words instead of drawing an empty room.
    """

    map: StoreMapOut | None
    shapes: list[ShapeOut]
    points: list[PointOut]
