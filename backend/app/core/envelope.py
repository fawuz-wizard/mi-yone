"""Response envelope + structured errors (Phase 2 §15). Never leak internals."""
import logging
import uuid
from typing import Any

from fastapi import Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from sqlalchemy.exc import IntegrityError

logger = logging.getLogger("miyone")


def ok(data: Any, status_code: int = 200) -> JSONResponse:
    return JSONResponse({"success": True, "data": data}, status_code=status_code)


class ApiError(Exception):
    def __init__(self, status: int, code: str, message: str):
        self.status = status
        self.code = code
        self.message = message


def _request_id(request: Request | None) -> str:
    # The middleware mints one id per request and stores it on request.state;
    # the envelope reuses it so the id a user sees is the id in the log.
    rid = getattr(getattr(request, "state", None), "request_id", None)
    return rid or f"req-{uuid.uuid4().hex[:10]}"


def fail(status: int, code: str, message: str, request: Request | None = None) -> JSONResponse:
    return JSONResponse(
        {"success": False, "error": {"code": code, "message": message, "request_id": _request_id(request)}},
        status_code=status,
    )


def install_handlers(app):
    @app.exception_handler(ApiError)
    async def api_error_handler(request: Request, exc: ApiError):
        return fail(exc.status, exc.code, exc.message, request)

    @app.exception_handler(RequestValidationError)
    async def validation_handler(request: Request, __: RequestValidationError):
        return fail(422, "VALIDATION_ERROR", "Some of the information is invalid.", request)

    @app.exception_handler(IntegrityError)
    async def integrity_handler(request: Request, exc: IntegrityError):
        # A database constraint said no (e.g. concurrent duplicate, over-settlement):
        # structured conflict, never a raw driver error. Logged without the
        # statement parameters (they can contain business figures).
        logger.warning(
            '{"request_id":"%s","event":"integrity_conflict","path":"%s","constraint":"%s"}',
            _request_id(request), request.url.path, _constraint_name(exc),
        )
        return fail(409, "CONFLICT", "That change conflicts with existing records.", request)

    @app.exception_handler(Exception)
    async def unexpected_handler(request: Request, exc: Exception):
        # Never expose stack traces (Phase 2 §20). The full traceback goes to
        # the server log under the same request id the user sees.
        logger.exception(
            '{"request_id":"%s","event":"unhandled_error","path":"%s","error":"%s"}',
            _request_id(request), request.url.path, type(exc).__name__,
        )
        return fail(500, "INTERNAL_ERROR", "Something didn't work on our side.", request)


def _constraint_name(exc: IntegrityError) -> str:
    diag = getattr(getattr(exc, "orig", None), "diag", None)
    return getattr(diag, "constraint_name", None) or "?"
