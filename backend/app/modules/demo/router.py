import secrets
from datetime import UTC, datetime, timedelta
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Path as PathParam, Request, Response, status
from sqlalchemy.orm import Session

from app.core.config import Settings
from app.modules.auth.dependencies import UserResponseData, get_db_session, require_permission
from app.modules.cameras.dependencies import get_camera_repository
from app.modules.cameras.repository import CameraRecord, CameraRepository
from app.modules.demo.dependencies import get_demo_repository, get_stream_probe
from app.modules.demo.repository import DEMO_CODE_PREFIX, DemoRepository
from app.modules.demo.schemas import DemoSessionResponse, DemoStreamStatus

router = APIRouter(prefix="/demo", tags=["demo"])


def expires_at(record: CameraRecord, settings: Settings) -> datetime:
    return record.created_at + timedelta(minutes=settings.demo_max_minutes)


def to_response(record: CameraRecord, settings: Settings) -> DemoSessionResponse:
    return DemoSessionResponse(
        id=record.id,
        camera_code=record.code,
        publish_path=record.code,
        whip_url=f"{settings.demo_whip_base_url.rstrip('/')}/{record.code}/whip",
        live_path=record.live_path,
        expires_at=expires_at(record, settings),
    )


@router.post("/sessions", response_model=DemoSessionResponse, status_code=status.HTTP_201_CREATED)
def create_demo_session(
    request: Request,
    session: Session = Depends(get_db_session),
    cameras: CameraRepository = Depends(get_camera_repository),
    demos: DemoRepository = Depends(get_demo_repository),
    current_user: UserResponseData = Depends(require_permission("cameras.manage")),
):
    settings: Settings = request.app.state.settings
    # Only one demo at a time: end every previous demo camera (audited).
    for previous in demos.list_active_demo(session):
        cameras.disable(session, camera_id=previous.id, user_id=current_user.user.id)

    code = f"{DEMO_CODE_PREFIX}{secrets.token_hex(4)}"
    record = cameras.create(
        session,
        user_id=current_user.user.id,
        code=code,
        name="Browser demo",
        location="Demo",
        source_type="rtsp",
        source_url=f"{settings.mediamtx_rtsp_read_url.rstrip('/')}/{code}",
    )
    return to_response(record, settings)


@router.get("/sessions/current", response_model=DemoSessionResponse)
def get_current_demo_session(
    request: Request,
    session: Session = Depends(get_db_session),
    demos: DemoRepository = Depends(get_demo_repository),
    current_user: UserResponseData = Depends(require_permission("cameras.manage")),
):
    settings: Settings = request.app.state.settings
    now = datetime.now(UTC)
    for record in demos.list_active_demo(session):
        if expires_at(record, settings) > now:
            return to_response(record, settings)
    raise HTTPException(status_code=404, detail="No active demo session")


@router.delete("/sessions/{id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_demo_session(
    id: UUID = PathParam(...),
    session: Session = Depends(get_db_session),
    cameras: CameraRepository = Depends(get_camera_repository),
    current_user: UserResponseData = Depends(require_permission("cameras.manage")),
):
    record = cameras.get_by_id(session, id)
    # A regular camera must never be disabled through this endpoint.
    if record is None or not record.code.startswith(DEMO_CODE_PREFIX):
        raise HTTPException(status_code=404, detail="Demo session not found")
    cameras.disable(session, camera_id=id, user_id=current_user.user.id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/sessions/{id}/stream", response_model=DemoStreamStatus)
def get_demo_stream_status(
    id: UUID = PathParam(...),
    session: Session = Depends(get_db_session),
    cameras: CameraRepository = Depends(get_camera_repository),
    probe=Depends(get_stream_probe),
    current_user: UserResponseData = Depends(require_permission("cameras.manage")),
):
    """Tell the demo page when the annotated stream is actually being published."""
    record = cameras.get_by_id(session, id)
    if record is None or not record.code.startswith(DEMO_CODE_PREFIX):
        raise HTTPException(status_code=404, detail="Demo session not found")
    return DemoStreamStatus(annotated_ready=probe(f"{record.code}_annotated"))
