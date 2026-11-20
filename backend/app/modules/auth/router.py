from datetime import UTC, datetime, timedelta

import jwt
from fastapi import APIRouter, Depends, Request
from pwdlib import PasswordHash
from sqlalchemy.orm import Session

from app.modules.auth.dependencies import UserResponseData, get_current_user, get_db_session, get_user_repository, invalid_credentials
from app.modules.auth.repository import UserRepository
from app.modules.auth.schemas import LoginRequest, LoginResponse, UserResponse

router = APIRouter(prefix="/auth", tags=["auth"])
password_hash = PasswordHash.recommended()
dummy_password_hash = password_hash.hash("invalid-password")


def as_response(current: UserResponseData) -> UserResponse:
    user = current.user
    return UserResponse(id=str(user.id), username=user.username, full_name=user.full_name, role=user.role, permissions=current.permissions)


@router.post("/login", response_model=LoginResponse)
def login(
    payload: LoginRequest,
    request: Request,
    session: Session = Depends(get_db_session),
    repository: UserRepository = Depends(get_user_repository),
):
    user = repository.find_by_identifier(session, payload.login_identifier)
    candidate_hash = user.password_hash if user else dummy_password_hash
    password_matches = password_hash.verify(payload.password, candidate_hash)
    if user is None or not user.is_active or not password_matches:
        raise invalid_credentials()
    secret = request.app.state.settings.jwt_secret
    if not secret:
        raise RuntimeError("JWT_SECRET is required")

    now = datetime.now(UTC)
    repository.mark_login(session, user.id)
    repository.add_login_audit(session, user.id)
    session.commit()
    permissions = repository.get_permissions(session, user.id)
    current = UserResponseData(user=user, permissions=permissions)
    token = jwt.encode(
        {"sub": str(user.id), "iat": now, "exp": now + timedelta(minutes=request.app.state.settings.jwt_expire_minutes)},
        secret,
        algorithm="HS256",
    )
    return LoginResponse(access_token=token, token_type="bearer", user=as_response(current))


@router.get("/me", response_model=UserResponse)
def me(current: UserResponseData = Depends(get_current_user)):
    return as_response(current)
