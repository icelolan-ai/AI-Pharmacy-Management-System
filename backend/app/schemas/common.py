from decimal import Decimal
from typing import Annotated, Generic, TypeVar

from pydantic import BaseModel, Field, PlainSerializer

T = TypeVar("T")

# Money input: Decimal >= 0 that fits numeric(10, 2).
MoneyIn = Annotated[Decimal, Field(ge=0, max_digits=10, decimal_places=2)]

# Money output: always a string with 2 decimal places, e.g. "95.00".
MoneyOut = Annotated[Decimal, PlainSerializer(lambda v: f"{v:.2f}", return_type=str)]


class Page(BaseModel, Generic[T]):
    items: list[T]
    total: int
    limit: int
    offset: int


def blank_to_none(value: str | None) -> str | None:
    """Strip text; empty strings become None."""
    if value is None:
        return None
    value = value.strip()
    return value or None


def escape_like(text: str) -> str:
    """Escape LIKE wildcards so user input matches literally (ESCAPE '\\')."""
    return text.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
