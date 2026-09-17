from datetime import datetime
from typing import Annotated
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from app.schemas.common import MoneyIn, MoneyOut, blank_to_none

_OPTIONAL_TEXT = (
    "generic_name",
    "strength",
    "dosage_form",
    "manufacturer",
    "category",
    "barcode",
    "active_ingredient",
)


class MedicineCreate(BaseModel):
    # extra="forbid": id, store_id, created_at, updated_at (or any unknown field) -> 400
    model_config = ConfigDict(extra="forbid")

    name: Annotated[str, Field(min_length=1)]
    generic_name: str | None = None
    strength: str | None = None
    dosage_form: str | None = None
    manufacturer: str | None = None
    category: str | None = None
    barcode: str | None = None
    active_ingredient: str | None = None
    reorder_point: Annotated[int, Field(ge=0)] | None = None
    selling_price: MoneyIn | None = None

    @field_validator("name", mode="before")
    @classmethod
    def _strip_name(cls, value):
        return value.strip() if isinstance(value, str) else value

    @field_validator(*_OPTIONAL_TEXT, mode="after")
    @classmethod
    def _blank_to_none(cls, value):
        return blank_to_none(value)


class MedicineUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: Annotated[str, Field(min_length=1)] | None = None
    generic_name: str | None = None
    strength: str | None = None
    dosage_form: str | None = None
    manufacturer: str | None = None
    category: str | None = None
    barcode: str | None = None
    active_ingredient: str | None = None
    reorder_point: Annotated[int, Field(ge=0)] | None = None
    selling_price: MoneyIn | None = None
    is_active: bool | None = None

    @field_validator("name", mode="before")
    @classmethod
    def _strip_name(cls, value):
        return value.strip() if isinstance(value, str) else value

    @field_validator(*_OPTIONAL_TEXT, mode="after")
    @classmethod
    def _blank_to_none(cls, value):
        return blank_to_none(value)

    @model_validator(mode="after")
    def _required_fields_not_null(self):
        for field in ("name", "is_active"):
            if field in self.model_fields_set and getattr(self, field) is None:
                raise ValueError(f"{field} must not be null")
        return self


class MedicineOut(BaseModel):
    id: UUID
    name: str
    generic_name: str | None
    strength: str | None
    dosage_form: str | None
    manufacturer: str | None
    category: str | None
    barcode: str | None
    active_ingredient: str | None
    reorder_point: int | None
    selling_price: MoneyOut | None
    is_active: bool
    available_quantity: int
    created_at: datetime
    updated_at: datetime
