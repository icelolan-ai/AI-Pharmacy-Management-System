"""Audit trail writer. Always call inside the same transaction as the change."""

import json
from datetime import date, datetime
from decimal import Decimal
from typing import Any, Literal
from uuid import UUID

from psycopg import Cursor
from psycopg.types.json import Jsonb

AuditAction = Literal["insert", "update", "delete"]


def _json_default(value: Any) -> Any:
    if isinstance(value, Decimal):
        return str(value)
    if isinstance(value, UUID):
        return str(value)
    if isinstance(value, (datetime, date)):
        return value.isoformat()
    raise TypeError(f"Object of type {type(value).__name__} is not JSON serializable")


def dumps_audit_value(value: Any) -> str:
    return json.dumps(value, default=_json_default, ensure_ascii=False)


def write_audit(
    cur: Cursor,
    table_name: str,
    record_id: UUID,
    action: AuditAction,
    old_value: dict[str, Any] | None,
    new_value: dict[str, Any] | None,
    changed_by: UUID,
    reason: str | None = None,
) -> None:
    if action not in ("insert", "update", "delete"):
        raise ValueError(f"Unsupported audit action: {action}")
    cur.execute(
        """
        INSERT INTO public.audit_logs
            (table_name, record_id, action, old_value, new_value, changed_by, reason)
        VALUES (%s, %s, %s, %s, %s, %s, %s)
        """,
        (
            table_name,
            record_id,
            action,
            None if old_value is None else Jsonb(old_value, dumps=dumps_audit_value),
            None if new_value is None else Jsonb(new_value, dumps=dumps_audit_value),
            changed_by,
            reason,
        ),
    )
