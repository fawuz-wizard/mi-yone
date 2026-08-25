"""Response envelope + structured errors (Phase 2 §15). Never leak internals."""
import uuid
from typing import Any

from fastapi import Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from sqlalchemy.exc import IntegrityError


def ok(data: Any, status_code: int = 200) -> JSONResponse:
    return JSONResponse({"success": True, "data": data}, status_code=status_code)


class ApiError(Exception):
    def __init__(self, status: int, code: str, message: str):
        self.status = status
        self.code = code
        self.message = message


def fail(status: int, code: str, message: str) -> JSONResponse:
    return JSONResponse(
        {"success": False, "error": {"code": code, "message": message, "request_id": f"req-{uuid.uuid4().hex[:10]}"}},
        status_code=status,
    )


def install_handlers(app):
    @app.exception_handler(ApiError)
    async def api_error_handler(_: Request, exc: ApiError):
        return fail(exc.status, exc.code, exc.message)

    @app.exception_handler(RequestValidationError)
    async def validation_handler(_: Request, __: RequestValidationError):
        return fail(422, "VALIDATION_ERROR", "Some of the information is invalid.")

    @app.exception_handler(IntegrityError)
    async def integrity_handler(_: Request, __: IntegrityError):
        # A database constraint said no (e.g. concurrent duplicate, over-settlement):
        # structured conflict, never a raw driver error.
        return fail(409, "CONFLICT", "That change conflicts with existing records.")

    @app.exception_handler(Exception)
    async def unexpected_handler(_: Request, __: Exception):
        # Never expose stack traces (Phase 2 §20). Details go to server logs only.
        return fail(500, "INTERNAL_ERROR", "Something didn't work on our side.")
