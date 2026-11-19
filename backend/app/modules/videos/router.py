from pathlib import Path
from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, File, HTTPException, Path as PathParam, Query, Request, UploadFile, status
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from app.modules.auth.dependencies import UserResponseData, get_db_session, require_permission
from app.modules.videos.dependencies import get_video_repository
from app.modules.videos.paths import get_contained_file
from app.modules.videos.repository import VideoRepository
from app.modules.videos.schemas import VideoJobResponse

ALLOWED_EXTENSIONS = {".mp4", ".avi", ".mov", ".mkv"}
CHUNK_SIZE = 1024 * 64

router = APIRouter(prefix="/videos", tags=["videos"])


@router.post("", response_model=VideoJobResponse, status_code=status.HTTP_201_CREATED)
async def upload_video(
    request: Request,
    file: UploadFile = File(...),
    session: Session = Depends(get_db_session),
    repository: VideoRepository = Depends(get_video_repository),
    current_user: UserResponseData = Depends(require_permission("videos.upload")),
):
    original_filename = file.filename or ""
    ext = Path(original_filename).suffix.lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(status_code=415, detail="Unsupported video format")

    job_id = uuid4()
    storage_dir = Path(request.app.state.settings.storage_dir)
    uploads_dir = storage_dir / "uploads"
    uploads_dir.mkdir(parents=True, exist_ok=True)
    target_path = uploads_dir / f"{job_id}{ext}"

    max_bytes = request.app.state.settings.max_upload_mb * 1024 * 1024
    bytes_written = 0

    try:
        with open(target_path, "wb") as buffer:
            while chunk := await file.read(CHUNK_SIZE):
                bytes_written += len(chunk)
                if bytes_written > max_bytes:
                    buffer.close()
                    target_path.unlink(missing_ok=True)
                    raise HTTPException(status_code=413, detail="File too large")
                buffer.write(chunk)
    except HTTPException:
        target_path.unlink(missing_ok=True)
        raise
    except Exception:
        target_path.unlink(missing_ok=True)
        raise

    try:
        job = repository.create_job(
            session=session,
            job_id=job_id,
            uploaded_by=current_user.user.id,
            original_filename=original_filename,
            input_path=str(target_path.resolve()),
        )
        session.commit()
    except Exception:
        session.rollback()
        target_path.unlink(missing_ok=True)
        raise

    return VideoJobResponse(
        id=job.id,
        original_filename=job.original_filename,
        status=job.status,
        progress=job.progress,
        created_at=job.created_at,
    )


@router.get("", response_model=list[VideoJobResponse])
def list_videos(
    limit: int = Query(default=50, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    session: Session = Depends(get_db_session),
    repository: VideoRepository = Depends(get_video_repository),
    _user: UserResponseData = Depends(require_permission("videos.read")),
):
    jobs = repository.list_jobs(session, limit=limit, offset=offset)
    return [
        VideoJobResponse(
            id=job.id,
            original_filename=job.original_filename,
            status=job.status,
            progress=job.progress,
            created_at=job.created_at,
        )
        for job in jobs
    ]


@router.get("/{id}", response_model=VideoJobResponse)
def get_video_job(
    id: UUID = PathParam(...),
    session: Session = Depends(get_db_session),
    repository: VideoRepository = Depends(get_video_repository),
    _user: UserResponseData = Depends(require_permission("videos.read")),
):
    job = repository.get_by_id(session, id)
    if job is None:
        raise HTTPException(status_code=404, detail="Video job not found")
    return VideoJobResponse(
        id=job.id,
        original_filename=job.original_filename,
        status=job.status,
        progress=job.progress,
        created_at=job.created_at,
    )


@router.get("/{id}/output")
def get_video_output(
    request: Request,
    id: UUID = PathParam(...),
    session: Session = Depends(get_db_session),
    repository: VideoRepository = Depends(get_video_repository),
    _user: UserResponseData = Depends(require_permission("videos.read")),
):
    job = repository.get_by_id(session, id)
    if job is None:
        raise HTTPException(status_code=404, detail="Video job not found")
    if job.status != "completed":
        raise HTTPException(status_code=409, detail="Video is not ready")
    output_path = get_contained_file(request.app.state.settings.storage_dir, job.output_path, missing_detail="Video file not found")
    return FileResponse(output_path, media_type="video/mp4")
