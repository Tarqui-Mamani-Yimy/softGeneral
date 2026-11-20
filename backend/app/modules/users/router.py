from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.modules.auth.dependencies import UserResponseData, get_db_session, require_permission
from app.modules.users.repository import UsersRepository
from app.modules.users.schemas import RoleResponse, UserCreateRequest, UserListItem, UserUpdateRequest

router = APIRouter(prefix="/users", tags=["users"])


def get_users_repository() -> UsersRepository:
    return UsersRepository()


@router.get("/roles", response_model=list[RoleResponse])
def list_roles(
    session: Session = Depends(get_db_session),
    repo: UsersRepository = Depends(get_users_repository),
    current_user: UserResponseData = Depends(require_permission("users.manage")),
):
    return [RoleResponse(**r) for r in repo.list_roles(session)]


@router.get("", response_model=list[UserListItem])
def list_users(
    search: str | None = Query(default=None),
    role: str | None = Query(default=None),
    is_active: bool | None = Query(default=None),
    session: Session = Depends(get_db_session),
    repo: UsersRepository = Depends(get_users_repository),
    current_user: UserResponseData = Depends(require_permission("users.manage")),
):
    users = repo.list_users(session, search=search, role=role, is_active=is_active)
    return [UserListItem(**u) for u in users]


@router.post("", response_model=UserListItem, status_code=status.HTTP_201_CREATED)
def create_user(
    payload: UserCreateRequest,
    session: Session = Depends(get_db_session),
    repo: UsersRepository = Depends(get_users_repository),
    current_user: UserResponseData = Depends(require_permission("users.manage")),
):
    if repo.exists_by_username_or_email(session, payload.username, payload.email):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Ya existe un usuario con ese nombre de usuario o correo electrónico",
        )
    try:
        user_id = repo.create(
            session,
            username=payload.username,
            email=payload.email,
            full_name=payload.full_name,
            plain_password=payload.password,
            role_code=payload.role,
            is_active=payload.is_active,
        )
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))

    user = repo.get_by_id(session, user_id)
    if not user:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Error creando usuario")
    return UserListItem(**user)


@router.get("/{user_id}", response_model=UserListItem)
def get_user(
    user_id: UUID,
    session: Session = Depends(get_db_session),
    repo: UsersRepository = Depends(get_users_repository),
    current_user: UserResponseData = Depends(require_permission("users.manage")),
):
    user = repo.get_by_id(session, user_id)
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Usuario no encontrado")
    return UserListItem(**user)


@router.patch("/{user_id}", response_model=UserListItem)
def update_user(
    user_id: UUID,
    payload: UserUpdateRequest,
    session: Session = Depends(get_db_session),
    repo: UsersRepository = Depends(get_users_repository),
    current_user: UserResponseData = Depends(require_permission("users.manage")),
):
    existing = repo.get_by_id(session, user_id)
    if not existing:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Usuario no encontrado")

    if payload.email and payload.email != existing["email"]:
        if repo.exists_by_username_or_email(session, existing["username"], payload.email, exclude_id=user_id):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Ya existe un usuario con ese correo electrónico",
            )

    try:
        updated = repo.update(
            session,
            user_id=user_id,
            email=payload.email,
            full_name=payload.full_name,
            plain_password=payload.password,
            role_code=payload.role,
            is_active=payload.is_active,
        )
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))

    return UserListItem(**updated)


@router.delete("/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_user(
    user_id: UUID,
    session: Session = Depends(get_db_session),
    repo: UsersRepository = Depends(get_users_repository),
    current_user: UserResponseData = Depends(require_permission("users.manage")),
):
    if current_user.user.id == user_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No puedes eliminar tu propia cuenta de usuario en sesión",
        )

    deleted = repo.delete(session, user_id)
    if not deleted:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Usuario no encontrado")
    return None
