"""One writer at a time per running number (D26 · D29 · D79).

Sale and purchase numbers are the day's highest number plus one, read inside
the transaction that writes them. Two transactions reading at the same
instant both get the same "plus one"; the unique index then rejects one of
them. A retry used to absorb that — and with enough people pressing at once,
the unlucky one ran out of retries and was told to try again (found by a
test that failed one run in five, D79).

So before reading the highest number, the transaction takes a lock that
only one transaction at a time may hold for that document and that day. The
next one waits until the first commits, then reads a highest number that
already includes it.

The lock is the two-number form, (document, day), never one number hashed
together: two kinds of document cannot end up on the same lock by
coincidence. Those two-number locks are a separate space from the
one-number locks the store and store-map writers take, so they cannot meet
those either. Held until the transaction ends; nothing to release.

The day is the business day the caller already used for the number's
prefix (D9) — passed in, never worked out again here.
"""

from datetime import date
from enum import IntEnum


class NumberedDocument(IntEnum):
    """The first half of the lock. Named after the decision each number
    follows, so the values say where they come from."""

    SALE = 26  # D26: S-YYMMDD-NNN
    PURCHASE = 29  # D29: R-YYMMDD-NNN


def day_key(business_day: date) -> int:
    """20261115 for 15 Nov 2026 — fits in the lock's 32-bit half."""
    return business_day.year * 10_000 + business_day.month * 100 + business_day.day


def lock_running_number(cur, document: NumberedDocument, business_day: date) -> None:
    """Wait for, then hold until commit, the right to issue this document's
    next number for this business day."""
    cur.execute(
        "SELECT pg_advisory_xact_lock(%s::int4, %s::int4)",
        (int(document), day_key(business_day)),
    )
