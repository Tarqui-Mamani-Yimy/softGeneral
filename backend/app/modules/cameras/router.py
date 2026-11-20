from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Path as PathParam, status
from sqlalchemy.orm import Session

from app.modules.auth.dependencies import UserResponseData, get_db_session, require_permission
from app.modules.cameras.dependencies import get_camera_repository
from app.modules.cameras.repository import CameraRecord, CameraRepository
from app.modules.cameras.schemas import CameraCreateRequest, CameraResponse, CameraUpdateRequest, validate_camera_source

router = APIRouter(prefix="/cameras", tags=["cameras"])


def to_response(record: CameraRecord, can_manage: bool) -> CameraResponse:
    return CameraResponse(
        id=record.id,
        code=record.code,
        name=record.name,
        location=record.location,
        source_type=record.source_type,
        source_url=record.source_url if can_manage else None,
        live_path=record.live_path,
        is_active=record.is_active,
        created_at=record.created_at,
        updated_at=record.updated_at,
    )


@router.get("", response_model=list[CameraResponse])
def list_cameras(
    session: Session = Depends(get_db_session),
    repository: CameraRepository = Depends(get_camera_repository),
    current_user: UserResponseData = Depends(require_permission("cameras.read")),
):
    can_manage = "cameras.manage" in current_user.permissions
    records = repository.list_cameras(session)
    return [to_response(r, can_manage) for r in records]


@router.get("/{id}", response_model=CameraResponse)
def get_camera(
    id: UUID = PathParam(...),
    session: Session = Depends(get_db_session),
    repository: CameraRepository = Depends(get_camera_repository),
    current_user: UserResponseData = Depends(require_permission("cameras.read")),
):
    can_manage = "cameras.manage" in current_user.permissions
    record = repository.get_by_id(session, id)
    if record is None:
        raise HTTPException(status_code=404, detail="Camera not found")
    return to_response(record, can_manage)


@router.post("", response_model=CameraResponse, status_code=status.HTTP_201_CREATED)
def create_camera(
    payload: CameraCreateRequest,
    session: Session = Depends(get_db_session),
    repository: CameraRepository = Depends(get_camera_repository),
    current_user: UserResponseData = Depends(require_permission("cameras.manage")),
):
    existing = repository.get_by_code(session, payload.code)
    if existing is not None:
        raise HTTPException(status_code=409, detail="Camera code already exists")

    record = repository.create(
        session,
        user_id=current_user.user.id,
        code=payload.code,
        name=payload.name,
        location=payload.location,
        source_type=payload.source_type,
        source_url=payload.source_url,
    )
    return to_response(record, can_manage=True)


@router.patch("/{id}", response_model=CameraResponse)
def update_camera(
    payload: CameraUpdateRequest,
    id: UUID = PathParam(...),
    session: Session = Depends(get_db_session),
    repository: CameraRepository = Depends(get_camera_repository),
    current_user: UserResponseData = Depends(require_permission("cameras.manage")),
):
    existing = repository.get_by_id(session, id)
    if existing is None:
        raise HTTPException(status_code=404, detail="Camera not found")

    # Validate the camera as it will be after the PATCH: changing only the type
    # must still match the stored URL, and changing only the URL must match the type.
    if payload.source_type is not None or payload.source_url is not None:
        effective_source_type = payload.source_type or existing.source_type
        effective_source_url = payload.source_url if payload.source_url is not None else existing.source_url
        try:
            validate_camera_source(effective_source_type, effective_source_url)
        except ValueError as exc:
            raise HTTPException(status_code=422, detail=str(exc)) from None

    record = repository.update(
        session,
        camera_id=id,
        user_id=current_user.user.id,
        name=payload.name,
        location=payload.location,
        source_type=payload.source_type,
        source_url=payload.source_url,
        is_active=payload.is_active,
    )
    if record is None:
        raise HTTPException(status_code=404, detail="Camera not found")
    return to_response(record, can_manage=True)


@router.post("/{id}/disable", response_model=CameraResponse)
def disable_camera(
    id: UUID = PathParam(...),
    session: Session = Depends(get_db_session),
    repository: CameraRepository = Depends(get_camera_repository),
    current_user: UserResponseData = Depends(require_permission("cameras.manage")),
):
    record = repository.disable(session, camera_id=id, user_id=current_user.user.id)
    if record is None:
        raise HTTPException(status_code=404, detail="Camera not found")
    return to_response(record, can_manage=True)
