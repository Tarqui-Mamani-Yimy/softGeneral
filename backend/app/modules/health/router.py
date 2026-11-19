from typing import Annotated

from fastapi import APIRouter, Depends, Request
from fastapi.responses import JSONResponse

from app.core.database import is_database_available

router = APIRouter(prefix="/health", tags=["health"])


def database_check(request: Request) -> bool:
    return is_database_available(request.app.state.engine)


@router.get("")
def health() -> dict[str, str]:
    return {"status": "ok"}


@router.get("/db")
def health_db(available: Annotated[bool, Depends(database_check)]) -> JSONResponse:
    if available:
        return JSONResponse({"database": "ok"})
    return JSONResponse({"database": "unavailable"}, status_code=503)
