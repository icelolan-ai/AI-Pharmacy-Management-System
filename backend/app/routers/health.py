"""GET /health — public liveness + database check. Exposes no internal details."""

from fastapi import APIRouter
from fastapi.responses import JSONResponse

from app import db

router = APIRouter(tags=["system"])


@router.get("/health")
def health() -> JSONResponse:
    # Sync handler: FastAPI runs it in a worker thread, so the blocking
    # database check does not stall the event loop.
    if db.check_database(timeout=3.0):
        return JSONResponse(status_code=200, content={"status": "ok", "database": "ok"})
    return JSONResponse(
        status_code=503, content={"status": "degraded", "database": "unavailable"}
    )
