from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Path as PathParam, Query, Request
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from app.modules.alerts.dependencies import get_alert_repository
from app.modules.alerts.repository import AlertRecord, AlertRepository
from app.modules.alerts.schemas import AlertResponse, AlertReviewRequest
from app.modules.auth.dependencies import UserResponseData, get_db_session, require_permission
from app.modules.videos.paths import get_contained_file

router = APIRouter(prefix="/alerts", tags=["alerts"])


def to_response(record: AlertRecord) -> AlertResponse:
    return AlertResponse(
        id=record.id,
        alert_type=record.alert_type,
        status=record.status,
        confidence=record.confidence,
        occurred_at=record.occurred_at,
        camera_id=record.camera_id,
        video_job_id=record.video_job_id,
        track_id=record.track_id,
        details=record.details,
        has_snapshot=record.has_snapshot,
        has_clip=record.has_clip,
        reviewed_by=record.reviewed_by,
        reviewed_at=record.reviewed_at,
        review_notes=record.review_notes,
        created_at=record.created_at or record.occurred_at,
    )


@router.get("", response_model=list[AlertResponse])
def list_alerts(
    status: str | None = Query(default=None),
    alert_type: str | None = Query(default=None),
    video_job_id: UUID | None = Query(default=None),
    limit: int = Query(default=50, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    session: Session = Depends(get_db_session),
    repository: AlertRepository = Depends(get_alert_repository),
    _user: UserResponseData = Depends(require_permission("alerts.read")),
):
    records = repository.list_alerts(
        session,
        status=status,
        alert_type=alert_type,
        video_job_id=video_job_id,
        limit=limit,
        offset=offset,
    )
    return [to_response(r) for r in records]


@router.get("/{id}", response_model=AlertResponse)
def get_alert(
    id: UUID = PathParam(...),
    session: Session = Depends(get_db_session),
    repository: AlertRepository = Depends(get_alert_repository),
    _user: UserResponseData = Depends(require_permission("alerts.read")),
):
    record = repository.get_by_id(session, id)
    if record is None:
        raise HTTPException(status_code=404, detail="Alert not found")
    return to_response(record)


@router.get("/{id}/snapshot")
def get_alert_snapshot(
    request: Request,
    id: UUID = PathParam(...),
    session: Session = Depends(get_db_session),
    repository: AlertRepository = Depends(get_alert_repository),
    _user: UserResponseData = Depends(require_permission("alerts.read")),
):
    record = repository.get_by_id(session, id)
    if record is None:
        raise HTTPException(status_code=404, detail="Alert not found")
    file_path = get_contained_file(
        request.app.state.settings.storage_dir,
        record.snapshot_path,
        missing_detail="Snapshot not found",
    )
    return FileResponse(file_path, media_type="image/jpeg")


@router.get("/{id}/clip")
def get_alert_clip(
    request: Request,
    id: UUID = PathParam(...),
    session: Session = Depends(get_db_session),
    repository: AlertRepository = Depends(get_alert_repository),
    _user: UserResponseData = Depends(require_permission("alerts.read")),
):
    record = repository.get_by_id(session, id)
    if record is None:
        raise HTTPException(status_code=404, detail="Alert not found")
    file_path = get_contained_file(
        request.app.state.settings.storage_dir,
        record.clip_path,
        missing_detail="Clip not found",
    )
    return FileResponse(file_path, media_type="video/mp4")


@router.post("/{id}/review", response_model=AlertResponse)
def review_alert(
    payload: AlertReviewRequest,
    id: UUID = PathParam(...),
    session: Session = Depends(get_db_session),
    repository: AlertRepository = Depends(get_alert_repository),
    current_user: UserResponseData = Depends(require_permission("alerts.review")),
):
    record, result = repository.review_alert(
        session,
        alert_id=id,
        reviewer_id=current_user.user.id,
        status=payload.status,
        notes=payload.notes,
    )
    if result == "not_found":
        raise HTTPException(status_code=404, detail="Alert not found")
    if result == "already_reviewed":
        raise HTTPException(status_code=409, detail="Alert already reviewed")
    if record is None:
        raise HTTPException(status_code=500, detail="Failed to review alert")
    return to_response(record)
