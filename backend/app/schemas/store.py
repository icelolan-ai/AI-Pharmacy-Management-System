"""Store profile schemas (ข้อมูลร้าน) — the details printed on receipts."""

from datetime import datetime
from typing import Annotated
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from app.schemas.common import blank_to_none

_TEXT_FIELDS = ("name", "owner_name", "address", "phone", "license_no", "tax_id")


class StoreProfileUpdate(BaseModel):
    # extra="forbid": id, updated_at, updated_by (or any unknown field) -> 400
    model_config = ConfigDict(extra="forbid")

    name: Annotated[str, Field(min_length=1)] | None = None
    # D31: free text — several owners go in this one field (กฎข้อ 66).
    owner_name: str | None = None
    address: str | None = None
    phone: str | None = None
    license_no: str | None = None
    tax_id: str | None = None

    @field_validator(*_TEXT_FIELDS, mode="after")
    @classmethod
    def _blank_to_none(cls, value):
        return blank_to_none(value)

    @model_validator(mode="after")
    def _name_not_cleared(self):
        # The shop must keep a name once it has one; the other fields may be cleared.
        if "name" in self.model_fields_set and self.name is None:
            raise ValueError("name must not be null")
        return self


class StoreProfileOut(BaseModel):
    """Every field is nullable: before the first save the profile does not exist yet."""

    id: UUID | None
    name: str | None
    owner_name: str | None
    address: str | None
    phone: str | None
    license_no: str | None
    tax_id: str | None
    updated_at: datetime | None
    updated_by: UUID | None
    updated_by_name: str | None
