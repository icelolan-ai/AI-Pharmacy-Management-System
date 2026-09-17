from typing import Literal
from uuid import UUID

from pydantic import BaseModel


class MeResponse(BaseModel):
    id: UUID
    email: str | None
    full_name: str | None
    role: Literal["owner", "pharmacist", "staff"]
