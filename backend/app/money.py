"""Money helpers: Decimal only, 2 decimal places, ROUND_HALF_UP."""

from decimal import ROUND_HALF_UP, Decimal

CENT = Decimal("0.01")
MAX_AMOUNT = Decimal("99999999.99")  # numeric(10, 2)


def money(value: Decimal) -> Decimal:
    return value.quantize(CENT, rounding=ROUND_HALF_UP)
