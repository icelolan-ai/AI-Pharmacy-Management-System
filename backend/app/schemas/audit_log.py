from datetime import datetime
from typing import Any, Literal
from uuid import UUID

from pydantic import BaseModel

AuditTableName = Literal[
    "medicines",
    "suppliers",
    "invoices",
    "purchases",
    "purchase_items",
    "medicine_lots",
    "sales",
    "sale_items",
    "inventory_transactions",
    "audit_logs",
    "user_profiles",
]


class AuditLogOut(BaseModel):
    id: UUID
    table_name: str
    record_id: UUID
    action: str
    old_value: Any
    new_value: Any
    changed_by: UUID | None
    changed_by_name: str | None
    reason: str | None
    created_at: datetime
