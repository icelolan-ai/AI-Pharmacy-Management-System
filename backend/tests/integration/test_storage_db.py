"""The invoice-scans bucket stays private (งาน 6.1).

🔴 ห้ามลบตลอดไป (Chat A)

Invoice photos carry supplier names, prices and sometimes a pharmacist's
signature. A bucket flipped to public by one click in the dashboard would put
every one of them on the open internet at a guessable URL, and nothing in the
app would notice — uploads and reads through the backend keep working exactly
the same. So the state itself is asserted, on the test project, every run.

Two things make a bucket readable from outside, and both are checked:
the bucket's own `public` flag, and any policy on storage.objects that lets
the `anon` or `public` role at this bucket's rows.

This only ever reads the TEST project, like every test here (db_guard).
Production was set up and checked once by script at the time; see the 6.1
report in docs/06-phase5-gate.md.
"""

import pytest

from app import db

pytestmark = pytest.mark.db

BUCKET = "invoice-scans"


def test_invoice_scans_bucket_exists_and_is_private():
    with db.get_transaction() as cur:
        cur.execute("SELECT public FROM storage.buckets WHERE id = %s", (BUCKET,))
        row = cur.fetchone()
    assert row is not None, f"bucket {BUCKET!r} is missing from the test project"
    assert row["public"] is False, f"bucket {BUCKET!r} is PUBLIC — every scan is readable by URL"


def test_no_policy_opens_invoice_scans_to_anonymous_callers():
    """A private bucket with an anon SELECT policy is public by another name."""
    with db.get_transaction() as cur:
        cur.execute(
            """
            SELECT p.polname AS name,
                   pg_get_expr(p.polqual, p.polrelid) AS using_expr,
                   pg_get_expr(p.polwithcheck, p.polrelid) AS check_expr,
                   ARRAY(SELECT rolname FROM pg_roles WHERE oid = ANY(p.polroles)) AS roles
            FROM pg_policy p
            JOIN pg_class c ON c.oid = p.polrelid
            JOIN pg_namespace ns ON ns.oid = c.relnamespace
            WHERE ns.nspname = 'storage' AND c.relname = 'objects'
            """
        )
        policies = cur.fetchall()

    def opens_this_bucket(policy) -> bool:
        text = f"{policy['using_expr'] or ''} {policy['check_expr'] or ''}"
        # A policy with no condition at all applies to every bucket, this one
        # included.
        applies = BUCKET in text or not text.strip()
        # polroles = {0} means PUBLIC, which pg_roles has no row for.
        outsiders = not policy["roles"] or bool({"anon", "public"} & set(policy["roles"]))
        return applies and outsiders

    offenders = [p["name"] for p in policies if opens_this_bucket(p)]
    assert offenders == [], f"policies letting outsiders at {BUCKET!r}: {offenders}"


# The limits Chat A approved for 6.1. HEIC is on the list on purpose: an
# iPhone saves photos as HEIC unless someone changes a setting, and a shop
# that cannot upload the photo it just took will stop using the feature.
SIZE_LIMIT = 10 * 1024 * 1024
ALLOWED_TYPES = {"image/jpeg", "image/png", "image/webp", "image/heic", "application/pdf"}


def test_invoice_scans_bucket_limits_size_and_type():
    """A bucket with no ceiling accepts anything anyone sends it — a 2 GB
    video as readily as a receipt. The limits are asserted exactly, so a
    wider list is caught as surely as a missing entry."""
    with db.get_transaction() as cur:
        cur.execute(
            "SELECT file_size_limit, allowed_mime_types FROM storage.buckets WHERE id = %s",
            (BUCKET,),
        )
        row = cur.fetchone()
    assert row is not None, f"bucket {BUCKET!r} is missing from the test project"
    assert row["file_size_limit"] == SIZE_LIMIT, (
        f"size limit is {row['file_size_limit']!r}, expected {SIZE_LIMIT} (10 MB)"
    )
    assert set(row["allowed_mime_types"] or []) == ALLOWED_TYPES, (
        f"allowed types are {sorted(row['allowed_mime_types'] or [])}, "
        f"expected {sorted(ALLOWED_TYPES)}"
    )
