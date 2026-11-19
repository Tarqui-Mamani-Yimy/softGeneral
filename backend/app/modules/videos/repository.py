import json
from dataclasses import dataclass
from datetime import datetime
from uuid import UUID

from sqlalchemy import text
from sqlalchemy.orm import Session


@dataclass
class VideoJobRecord:
    id: UUID
    original_filename: str
    status: str
    progress: float
    created_at: datetime
    input_path: str | None = None
    output_path: str | None = None
    uploaded_by: UUID | None = None
    error_message: str | None = None
    started_at: datetime | None = None
    finished_at: datetime | None = None


class VideoRepository:
    def create_job(
        self,
        session: Session,
        job_id: UUID,
        uploaded_by: UUID,
        original_filename: str,
        input_path: str,
    ) -> VideoJobRecord:
        row = session.execute(
            text("""INSERT INTO video_jobs (id, uploaded_by, original_filename, input_path, status, progress)
                    VALUES (:id, :uploaded_by, :original_filename, :input_path, 'queued', 0)
                    RETURNING id, uploaded_by, original_filename, input_path, output_path, status, progress, error_message, created_at, started_at, finished_at"""),
            {
                "id": job_id,
                "uploaded_by": uploaded_by,
                "original_filename": original_filename,
                "input_path": input_path,
            },
        ).mappings().one()

        session.execute(
            text("""INSERT INTO audit_log (user_id, action, entity_type, entity_id, details)
                    VALUES (:user_id, 'video.uploaded', 'video_job', :entity_id, CAST(:details AS jsonb))"""),
            {
                "user_id": uploaded_by,
                "entity_id": str(job_id),
                "details": json.dumps({"original_filename": original_filename}),
            },
        )
        return self._record(row)

    def get_by_id(self, session: Session, job_id: UUID) -> VideoJobRecord | None:
        row = session.execute(
            text("""SELECT id, uploaded_by, original_filename, input_path, output_path, status, progress, error_message, created_at, started_at, finished_at
                    FROM video_jobs
                    WHERE id = :id"""),
            {"id": job_id},
        ).mappings().one_or_none()
        return self._record(row)

    def list_jobs(self, session: Session, limit: int = 50, offset: int = 0) -> list[VideoJobRecord]:
        rows = session.execute(
            text("""SELECT id, uploaded_by, original_filename, input_path, output_path, status, progress, error_message, created_at, started_at, finished_at
                    FROM video_jobs
                    ORDER BY created_at DESC
                    LIMIT :limit OFFSET :offset"""),
            {"limit": limit, "offset": offset},
        ).mappings().all()
        return [self._record(row) for row in rows]

    @staticmethod
    def _record(row) -> VideoJobRecord | None:
        if row is None:
            return None
        data = dict(row)
        if "progress" in data and data["progress"] is not None:
            data["progress"] = float(data["progress"])
        return VideoJobRecord(**data)
