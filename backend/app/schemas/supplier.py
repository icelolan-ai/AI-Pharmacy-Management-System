import re
from datetime import datetime
from typing import Annotated
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from app.schemas.common import blank_to_none

# Basic shape check only (no email-validator dependency).
_EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
_OPTIONAL_TEXT = ("contact_person", "phone", "email", "address")


def _check_email(value: str | None) -> str | None:
    if value is not None and not _EMAIL_RE.fullmatch(value):
        raise ValueError("invalid email format")
    return value


class SupplierCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: Annotated[str, Field(min_length=1)]
    contact_person: str | None = None
    phone: str | None = None
    email: str | None = None
    address: str | None = None
    lead_time_days: Annotated[int, Field(ge=0)] | None = None

    @field_validator("name", mode="before")
    @classmethod
    def _strip_name(cls, value):
        return value.strip() if isinstance(value, str) else value

    @field_validator(*_OPTIONAL_TEXT, mode="after")
    @classmethod
    def _blank_to_none(cls, value):
        return blank_to_none(value)

    @field_validator("email", mode="after")
    @classmethod
    def _email(cls, value):
        return _check_email(value)


class SupplierUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: Annotated[str, Field(min_length=1)] | None = None
    contact_person: str | None = None
    phone: str | None = None
    email: str | None = None
    address: str | None = None
    lead_time_days: Annotated[int, Field(ge=0)] | None = None

    @field_validator("name", mode="before")
    @classmethod
    def _strip_name(cls, value):
        return value.strip() if isinstance(value, str) else value

    @field_validator(*_OPTIONAL_TEXT, mode="after")
    @classmethod
    def _blank_to_none(cls, value):
        return blank_to_none(value)

    @field_validator("email", mode="after")
    @classmethod
    def _email(cls, value):
        return _check_email(value)

    @model_validator(mode="after")
    def _name_not_null(self):
        if "name" in self.model_fields_set and self.name is None:
            raise ValueError("name must not be null")
        return self


class SupplierOut(BaseModel):
    id: UUID
    name: str
    contact_person: str | None
    phone: str | None
    email: str | None
    address: str | None
    lead_time_days: int | None
    created_at: datetime
    updated_at: datetime
