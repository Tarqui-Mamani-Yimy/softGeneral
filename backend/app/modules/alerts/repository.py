import json
from dataclasses import dataclass, field
from datetime import datetime
from uuid import UUID

from sqlalchemy import text
from sqlalchemy.orm import Session


@dataclass
class AlertRecord:
    id: UUID
    alert_type: str
    status: str
    confidence: float
    occurred_at: datetime
    camera_id: UUID | None = None
    video_job_id: UUID | None = None
    track_id: int | None = None
    snapshot_path: str | None = None
    clip_path: str | None = None
    details: dict = field(default_factory=dict)
    reviewed_by: UUID | None = None
    reviewed_at: datetime | None = None
    review_notes: str | None = None
    created_at: datetime | None = None

    @property
    def has_snapshot(self) -> bool:
        return bool(self.snapshot_path)

    @property
    def has_clip(self) -> bool:
        return bool(self.clip_path)


class AlertRepository:
    def create_alert(self, session: Session, **values) -> UUID:
        row = session.execute(
            text("""INSERT INTO alerts
                   (id, alert_type, video_job_id, occurred_at, confidence, track_id,
                    snapshot_path, clip_path, details, status)
                   VALUES (:id, :alert_type, :video_job_id, :occurred_at, :confidence,
                           :track_id, :snapshot_path, :clip_path,
                           CAST(:details AS jsonb), 'pending')
                   RETURNING id"""),
            {**values, "details": json.dumps(values["details"])},
        )
        return row.scalar_one()

    def delete_for_video_job(self, session: Session, video_job_id: UUID) -> None:
        session.execute(text("DELETE FROM alerts WHERE video_job_id = :video_job_id"), {"video_job_id": video_job_id})

    def get_by_id(self, session: Session, alert_id: UUID) -> AlertRecord | None:
        row = session.execute(
            text("""SELECT id, alert_type, camera_id, video_job_id, occurred_at, confidence, track_id,
                          snapshot_path, clip_path, details, status, reviewed_by, reviewed_at,
                          review_notes, created_at
                   FROM alerts
                   WHERE id = :id"""),
            {"id": alert_id},
        ).mappings().one_or_none()
        return self._record(row)

    def list_alerts(
        self,
        session: Session,
        status: str | None = None,
        alert_type: str | None = None,
        video_job_id: UUID | None = None,
        limit: int = 50,
        offset: int = 0,
    ) -> list[AlertRecord]:
        conditions = []
        params: dict = {"limit": limit, "offset": offset}
        if status is not None:
            conditions.append("status = :status")
            params["status"] = status
        if alert_type is not None:
            conditions.append("alert_type = :alert_type")
            params["alert_type"] = alert_type
        if video_job_id is not None:
            conditions.append("video_job_id = :video_job_id")
            params["video_job_id"] = video_job_id

        where_clause = f"WHERE {' AND '.join(conditions)}" if conditions else ""
        query = f"""SELECT id, alert_type, camera_id, video_job_id, occurred_at, confidence, track_id,
                           snapshot_path, clip_path, details, status, reviewed_by, reviewed_at,
                           review_notes, created_at
                    FROM alerts
                    {where_clause}
                    ORDER BY occurred_at DESC
                    LIMIT :limit OFFSET :offset"""

        rows = session.execute(text(query), params).mappings().all()
        return [self._record(row) for row in rows if row is not None]

    def review_alert(
        self,
        session: Session,
        alert_id: UUID,
        reviewer_id: UUID,
        status: str,
        notes: str | None,
    ) -> tuple[AlertRecord | None, str]:
        result = session.execute(
            text("""UPDATE alerts
                    SET status = :status,
                        reviewed_by = :reviewer_id,
                        reviewed_at = now(),
                        review_notes = :notes
                    WHERE id = :alert_id AND status = 'pending'
                    RETURNING id, alert_type, camera_id, video_job_id, occurred_at, confidence, track_id,
                              snapshot_path, clip_path, details, status, reviewed_by, reviewed_at,
                              review_notes, created_at"""),
            {
                "status": status,
                "reviewer_id": reviewer_id,
                "notes": notes,
                "alert_id": alert_id,
            },
        )
        row = result.mappings().one_or_none()
        if row is None:
            exists = session.execute(
                text("SELECT id, status FROM alerts WHERE id = :alert_id"),
                {"alert_id": alert_id},
            ).mappings().one_or_none()
            if exists is None:
                return None, "not_found"
            return None, "already_reviewed"

        session.execute(
            text("""INSERT INTO audit_log (user_id, action, entity_type, entity_id, details)
                    VALUES (:user_id, :action, 'alert', :entity_id, CAST(:details AS jsonb))"""),
            {
                "user_id": reviewer_id,
                "action": f"alert.{status}",
                "entity_id": str(alert_id),
                "details": json.dumps({"notes": notes} if notes else {}),
            },
        )
        session.commit()
        return self._record(row), "ok"

    @staticmethod
    def _record(row) -> AlertRecord | None:
        if row is None:
            return None
        data = dict(row)
        if "confidence" in data and data["confidence"] is not None:
            data["confidence"] = float(data["confidence"])
        if "details" in data and isinstance(data["details"], str):
            try:
                data["details"] = json.loads(data["details"])
            except Exception:
                pass
        return AlertRecord(**data)
