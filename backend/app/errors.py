from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException


class ApiError(Exception):
    def __init__(self, status: int, code: str, message: str, details=None):
        self.status, self.code, self.message, self.details = status, code, message, details


def _err(status, code, message, details=None):
    return JSONResponse(status_code=status,
                        content={"error": {"code": code, "message": message, "details": details}})


def register_error_handlers(app: FastAPI):
    @app.exception_handler(ApiError)
    async def _api(_: Request, exc: ApiError):
        return _err(exc.status, exc.code, exc.message, exc.details)

    @app.exception_handler(RequestValidationError)
    async def _validation(_: Request, exc: RequestValidationError):
        details = [{"field": ".".join(str(p) for p in e["loc"][1:]), "message": e["msg"]}
                   for e in exc.errors()]
        first = details[0] if details else {"field": "", "message": "Invalid input"}
        msg = f"{first['field']}: {first['message']}" if first["field"] else first["message"]
        return _err(422, "validation_error", msg, details)

    @app.exception_handler(StarletteHTTPException)
    async def _http(_: Request, exc: StarletteHTTPException):
        return _err(exc.status_code, "http_error", str(exc.detail))

    @app.exception_handler(Exception)
    async def _unhandled(_: Request, exc: Exception):
        return _err(500, "internal_error", "Something went wrong. Please try again.")
