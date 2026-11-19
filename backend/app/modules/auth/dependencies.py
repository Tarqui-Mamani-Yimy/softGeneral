from __future__ import annotations

from collections.abc import Callable, Generator
from uuid import UUID

import jwt
from fastapi import Depends, HTTPException, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from app.modules.auth.repository import UserRecord, UserRepository

bearer = HTTPBearer(auto_error=False)


def get_user_repository() -> UserRepository:
    return UserRepository()


def get_db_session(request: Request) -> Generator[Session, None, None]:
    session = request.app.state.session_factory()
    try:
        yield session
    finally:
        session.close()


def invalid_credentials() -> HTTPException:
    return HTTPException(status_code=401, detail="Invalid credentials")


def get_current_user(
    request: Request,
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer),
    session: Session = Depends(get_db_session),
    repository: UserRepository = Depends(get_user_repository),
) -> UserResponseData:
    secret = request.app.state.settings.jwt_secret
    if not secret or credentials is None:
        raise invalid_credentials()
    try:
        claims = jwt.decode(
            credentials.credentials,
            secret,
            algorithms=["HS256"],
            options={"require": ["exp", "sub", "iat"]},
        )
        user_id = UUID(str(claims["sub"]))
    except (jwt.PyJWTError, KeyError, TypeError, ValueError):
        raise invalid_credentials() from None

    user = repository.get_by_id(session, user_id)
    if user is None or not user.is_active:
        raise invalid_credentials()
    permissions = repository.get_permissions(session, user.id)
    return UserResponseData(user=user, permissions=permissions)


class UserResponseData:
    def __init__(self, user: UserRecord, permissions: list[str]):
        self.user = user
        self.permissions = permissions


def require_permission(code: str) -> Callable:
    def dependency(current: UserResponseData = Depends(get_current_user)) -> UserResponseData:
        if code not in current.permissions:
            raise HTTPException(status_code=403, detail="Permission denied")
        return current

    return dependency
