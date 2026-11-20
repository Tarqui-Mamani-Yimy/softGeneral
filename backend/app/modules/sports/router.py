from pathlib import Path
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from app.core.config import Settings
from app.modules.auth.dependencies import UserResponseData, get_current_user, get_db_session
from app.modules.sports.repository import SportsEventRepository
from app.modules.sports.schemas import SportsEventResponse, SportsSummaryResponse

router = APIRouter(prefix="/sports", tags=["sports"])


def get_sports_repository() -> SportsEventRepository:
    return SportsEventRepository()


@router.get("/events", response_model=list[SportsEventResponse])
def list_sports_events(
    video_job_id: UUID | None = Query(default=None),
    camera_id: UUID | None = Query(default=None),
    event_type: str | None = Query(default=None),
    limit: int = Query(default=100, ge=1, le=500),
    session: Session = Depends(get_db_session),
    repo: SportsEventRepository = Depends(get_sports_repository),
    current_user: UserResponseData = Depends(get_current_user),
):
    records = repo.list_events(
        session,
        video_job_id=video_job_id,
        camera_id=camera_id,
        event_type=event_type,
        limit=limit,
    )
    return [
        SportsEventResponse(
            id=r.id,
            event_type=r.event_type,
            confidence=r.confidence,
            occurred_at=r.occurred_at,
            camera_id=r.camera_id,
            video_job_id=r.video_job_id,
            details=r.details,
            has_snapshot=r.has_snapshot,
            created_at=r.created_at or r.occurred_at,
        )
        for r in records
    ]


@router.get("/summary", response_model=SportsSummaryResponse)
def get_sports_summary(
    video_job_id: UUID | None = Query(default=None),
    session: Session = Depends(get_db_session),
    repo: SportsEventRepository = Depends(get_sports_repository),
    current_user: UserResponseData = Depends(get_current_user),
):
    summary = repo.get_summary(session, video_job_id=video_job_id)
    return SportsSummaryResponse(
        total_events=summary["total_events"],
        total_ball_events=summary["total_ball_events"],
        total_formation_events=summary["total_formation_events"],
        total_referee_events=summary["total_referee_events"],
        events=[
            SportsEventResponse(
                id=r.id,
                event_type=r.event_type,
                confidence=r.confidence,
                occurred_at=r.occurred_at,
                camera_id=r.camera_id,
                video_job_id=r.video_job_id,
                details=r.details,
                has_snapshot=r.has_snapshot,
                created_at=r.created_at or r.occurred_at,
            )
            for r in summary["events"]
        ],
    )


@router.get("/events/{event_id}/snapshot")
def get_sports_event_snapshot(
    event_id: UUID,
    session: Session = Depends(get_db_session),
    repo: SportsEventRepository = Depends(get_sports_repository),
    current_user: UserResponseData = Depends(get_current_user),
):
    record = repo.get_by_id(session, event_id)
    if record is None or not record.snapshot_path:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Snapshot not found")
    
    settings = Settings()
    path = Path(record.snapshot_path)
    if not path.is_absolute():
        path = Path(settings.storage_dir) / path
    if not path.exists():
        fallback = Path(settings.storage_dir) / "sports" / f"{event_id}.jpg"
        if fallback.exists():
            path = fallback
        else:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Snapshot file missing")
    return FileResponse(path, media_type="image/jpeg")
