"""GET /api/v1/audit-logs (spec 9.8) — owner only."""

from datetime import date
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Query

from app.auth import CurrentUser, require_roles
from app.schemas.audit_log import AuditLogOut, AuditTableName
from app.schemas.common import Page
from app.services import audit_logs as audit_log_service

router = APIRouter(prefix="/api/v1/audit-logs", tags=["audit"])

Owner = Annotated[CurrentUser, Depends(require_roles("owner"))]


@router.get("", response_model=Page[AuditLogOut])
def list_audit_logs(
    user: Owner,
    table_name: AuditTableName | None = None,
    record_id: UUID | None = None,
    changed_by: UUID | None = None,
    date_from: date | None = None,
    date_to: date | None = None,
    limit: Annotated[int, Query(ge=1, le=200)] = 50,
    offset: Annotated[int, Query(ge=0)] = 0,
):
    return audit_log_service.list_audit_logs(
        table_name=table_name,
        record_id=record_id,
        changed_by=changed_by,
        date_from=date_from,
        date_to=date_to,
        limit=limit,
        offset=offset,
    )
