"""Central error format: {"error": {"code", "message", "details"}}."""

import logging
from typing import Any

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

logger = logging.getLogger(__name__)


class AppError(Exception):
    """Business error returned to the client in the central error format."""

    def __init__(
        self,
        code: str,
        message: str,
        http_status: int,
        details: dict[str, Any] | list[Any] | None = None,
    ) -> None:
        super().__init__(message)
        self.code = code
        self.message = message
        self.http_status = http_status
        self.details = details


def error_response(
    http_status: int,
    code: str,
    message: str,
    details: dict[str, Any] | list[Any] | None = None,
) -> JSONResponse:
    return JSONResponse(
        status_code=http_status,
        content={"error": {"code": code, "message": message, "details": details}},
    )


_HTTP_ERRORS = {
    401: ("UNAUTHENTICATED", "กรุณาเข้าสู่ระบบ"),
    403: ("FORBIDDEN", "ไม่มีสิทธิ์ดำเนินการนี้"),
    404: ("NOT_FOUND", "ไม่พบข้อมูลที่ร้องขอ"),
    405: ("METHOD_NOT_ALLOWED", "ไม่รองรับวิธีการเรียกนี้"),
}


async def _app_error_handler(request: Request, exc: AppError) -> JSONResponse:
    return error_response(exc.http_status, exc.code, exc.message, exc.details)


async def _validation_error_handler(
    request: Request, exc: RequestValidationError
) -> JSONResponse:
    # Field location and reason only; never echo submitted values back.
    details = [
        {
            "field": ".".join(str(part) for part in err.get("loc", ())),
            "reason": err.get("type", "invalid"),
        }
        for err in exc.errors()
    ]
    return error_response(400, "VALIDATION_ERROR", "ข้อมูลที่ส่งมาไม่ถูกต้อง", details)


async def _http_error_handler(
    request: Request, exc: StarletteHTTPException
) -> JSONResponse:
    code, message = _HTTP_ERRORS.get(
        exc.status_code, ("HTTP_ERROR", "ไม่สามารถดำเนินการตามคำขอได้")
    )
    return error_response(exc.status_code, code, message)


async def _unhandled_error_handler(request: Request, exc: Exception) -> JSONResponse:
    logger.error(
        "Unhandled error on %s %s", request.method, request.url.path, exc_info=exc
    )
    return error_response(500, "INTERNAL_ERROR", "เกิดข้อผิดพลาดภายในระบบ")


def register_error_handlers(app: FastAPI) -> None:
    app.add_exception_handler(AppError, _app_error_handler)
    app.add_exception_handler(RequestValidationError, _validation_error_handler)
    app.add_exception_handler(StarletteHTTPException, _http_error_handler)
    app.add_exception_handler(Exception, _unhandled_error_handler)
