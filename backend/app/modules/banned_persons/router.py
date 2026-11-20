from pathlib import Path
from uuid import UUID, uuid4

from fastapi import (
    APIRouter,
    Depends,
    File,
    Form,
    HTTPException,
    Path as PathParam,
    Request,
    UploadFile,
    status,
)
from fastapi.responses import FileResponse, Response
from sqlalchemy.orm import Session

from app.core.config import Settings
from app.modules.auth.dependencies import (
    UserResponseData,
    get_db_session,
    require_permission,
)
from app.modules.banned_persons.dependencies import get_banned_person_repository
from app.modules.banned_persons.repository import BannedPersonRecord, BannedPersonRepository
from app.modules.banned_persons.schemas import (
    BannedPersonResponse,
    BannedPersonUpdateRequest,
    SeverityLevel,
)
from vision.face.recognizer import FaceRecognitionEngine

router = APIRouter(prefix="/banned-persons", tags=["banned-persons"])


def _to_response(record: BannedPersonRecord) -> BannedPersonResponse:
    return BannedPersonResponse(
        id=record.id,
        full_name=record.full_name,
        document_id=record.document_id,
        reason=record.reason,
        severity=record.severity,  # type: ignore[arg-type]
        photo_url=f"/api/v1/banned-persons/{record.id}/photo",
        is_active=record.is_active,
        banned_at=record.banned_at,
        notes=record.notes,
        created_at=record.created_at,
        updated_at=record.updated_at,
    )


@router.get("", response_model=list[BannedPersonResponse])
def list_banned_persons(
    include_inactive: bool = False,
    session: Session = Depends(get_db_session),
    repo: BannedPersonRepository = Depends(get_banned_person_repository),
    current_user: UserResponseData = Depends(require_permission("banned_persons.read")),
):
    records = repo.list_all(session, include_inactive=include_inactive)
    return [_to_response(r) for r in records]


@router.post("", response_model=BannedPersonResponse, status_code=status.HTTP_201_CREATED)
async def create_banned_person(
    request: Request,
    full_name: str = Form(..., min_length=1, max_length=255),
    document_id: str | None = Form(default=None),
    reason: str = Form(..., min_length=1),
    severity: SeverityLevel = Form(default="high"),
    notes: str | None = Form(default=None),
    photo: UploadFile = File(...),
    session: Session = Depends(get_db_session),
    repo: BannedPersonRepository = Depends(get_banned_person_repository),
    current_user: UserResponseData = Depends(require_permission("banned_persons.manage")),
):
    photo_bytes = await photo.read()
    if not photo_bytes:
        raise HTTPException(status_code=400, detail="El archivo de foto está vacío.")

    # Face recognition model extraction
    face_engine = FaceRecognitionEngine()
    try:
        encoding, (x, y, w, h) = face_engine.extract_encoding(photo_bytes)
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=str(exc),
        )

    settings: Settings = request.app.state.settings
    storage_base = Path(settings.storage_dir).resolve()
    photos_dir = storage_base / "banned_persons"
    photos_dir.mkdir(parents=True, exist_ok=True)

    person_id = uuid4()
    photo_filename = f"{person_id}.jpg"
    photo_dest = photos_dir / photo_filename
    photo_dest.write_bytes(photo_bytes)

    relative_photo_path = f"banned_persons/{photo_filename}"
    record = repo.create(
        session=session,
        full_name=full_name.strip(),
        document_id=document_id.strip() if document_id else None,
        reason=reason.strip(),
        severity=severity,
        photo_path=relative_photo_path,
        face_encoding=encoding,
        notes=notes.strip() if notes else None,
        created_by=current_user.user.id,
    )
    return _to_response(record)


@router.get("/{id}/photo")
def get_banned_person_photo(
    request: Request,
    id: UUID = PathParam(...),
    session: Session = Depends(get_db_session),
    repo: BannedPersonRepository = Depends(get_banned_person_repository),
    current_user: UserResponseData = Depends(require_permission("banned_persons.read")),
):
    record = repo.get_by_id(session, id)
    if record is None:
        raise HTTPException(status_code=404, detail="Persona no encontrada.")

    settings: Settings = request.app.state.settings
    photo_path = Path(settings.storage_dir) / record.photo_path
    if not photo_path.is_file():
        raise HTTPException(status_code=404, detail="Foto no encontrada en el almacenamiento.")

    return FileResponse(photo_path, media_type="image/jpeg")


@router.patch("/{id}", response_model=BannedPersonResponse)
def update_banned_person(
    payload: BannedPersonUpdateRequest,
    id: UUID = PathParam(...),
    session: Session = Depends(get_db_session),
    repo: BannedPersonRepository = Depends(get_banned_person_repository),
    current_user: UserResponseData = Depends(require_permission("banned_persons.manage")),
):
    record = repo.update(session, id, **payload.model_dump(exclude_unset=True))
    if record is None:
        raise HTTPException(status_code=404, detail="Persona no encontrada.")
    return _to_response(record)


@router.delete("/{id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_banned_person(
    id: UUID = PathParam(...),
    session: Session = Depends(get_db_session),
    repo: BannedPersonRepository = Depends(get_banned_person_repository),
    current_user: UserResponseData = Depends(require_permission("banned_persons.manage")),
):
    deleted = repo.delete(session, id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Persona no encontrada.")
    return Response(status_code=status.HTTP_204_NO_CONTENT)

