import json
from dataclasses import dataclass, field
from datetime import datetime
from uuid import UUID

from sqlalchemy import text
from sqlalchemy.orm import Session


@dataclass
class SportsEventRecord:
    id: UUID
    event_type: str
    confidence: float
    occurred_at: datetime
    camera_id: UUID | None = None
    video_job_id: UUID | None = None
    snapshot_path: str | None = None
    clip_path: str | None = None
    details: dict = field(default_factory=dict)
    created_at: datetime | None = None

    @property
    def has_snapshot(self) -> bool:
        return bool(self.snapshot_path)


class SportsEventRepository:
    def create(self, session: Session, **values) -> UUID:
        row = session.execute(
            text("""INSERT INTO sports_events
                   (id, event_type, camera_id, video_job_id, occurred_at, confidence,
                    snapshot_path, clip_path, details)
                   VALUES (:id, :event_type, :camera_id, :video_job_id, :occurred_at,
                           :confidence, :snapshot_path, :clip_path,
                           CAST(:details AS jsonb))
                   RETURNING id"""),
            {
                "id": values["id"],
                "event_type": values["event_type"],
                "camera_id": values.get("camera_id"),
                "video_job_id": values.get("video_job_id"),
                "occurred_at": values["occurred_at"],
                "confidence": values["confidence"],
                "snapshot_path": values.get("snapshot_path"),
                "clip_path": values.get("clip_path"),
                "details": json.dumps(values.get("details", {})),
            },
        )
        session.commit()
        return row.scalar_one()

    def list_events(
        self,
        session: Session,
        video_job_id: UUID | None = None,
        camera_id: UUID | None = None,
        event_type: str | None = None,
        limit: int = 100,
    ) -> list[SportsEventRecord]:
        conditions = []
        params: dict = {"limit": limit}
        if video_job_id:
            conditions.append("video_job_id = :video_job_id")
            params["video_job_id"] = video_job_id
        if camera_id:
            conditions.append("camera_id = :camera_id")
            params["camera_id"] = camera_id
        if event_type:
            conditions.append("event_type = :event_type")
            params["event_type"] = event_type

        where_clause = f"WHERE {' AND '.join(conditions)}" if conditions else ""
        query = f"""
            SELECT id, event_type, camera_id, video_job_id, occurred_at, confidence,
                   snapshot_path, clip_path, details, created_at
            FROM sports_events
            {where_clause}
            ORDER BY occurred_at DESC
            LIMIT :limit
        """
        rows = session.execute(text(query), params).mappings().all()
        return [self._record(row) for row in rows]

    def get_by_id(self, session: Session, event_id: UUID) -> SportsEventRecord | None:
        row = session.execute(
            text("""SELECT id, event_type, camera_id, video_job_id, occurred_at, confidence,
                           snapshot_path, clip_path, details, created_at
                    FROM sports_events
                    WHERE id = :id"""),
            {"id": event_id},
        ).mappings().one_or_none()
        return self._record(row) if row else None

    def get_summary(self, session: Session, video_job_id: UUID | None = None) -> dict:
        params: dict = {}
        cond = ""
        if video_job_id:
            cond = "WHERE video_job_id = :video_job_id"
            params["video_job_id"] = video_job_id

        total = session.execute(text(f"SELECT COUNT(*) FROM sports_events {cond}"), params).scalar_one()
        ball = session.execute(
            text(f"SELECT COUNT(*) FROM sports_events {cond} {'AND' if cond else 'WHERE'} event_type = 'ball_in_play'"),
            params,
        ).scalar_one()
        formation = session.execute(
            text(f"SELECT COUNT(*) FROM sports_events {cond} {'AND' if cond else 'WHERE'} event_type = 'match_formation'"),
            params,
        ).scalar_one()
        referee = session.execute(
            text(f"SELECT COUNT(*) FROM sports_events {cond} {'AND' if cond else 'WHERE'} event_type = 'referee_active'"),
            params,
        ).scalar_one()

        events = self.list_events(session, video_job_id=video_job_id, limit=20)
        return {
            "total_events": total,
            "total_ball_events": ball,
            "total_formation_events": formation,
            "total_referee_events": referee,
            "events": events,
        }

    def _record(self, row) -> SportsEventRecord:
        details = row["details"]
        if isinstance(details, str):
            details = json.loads(details)
        return SportsEventRecord(
            id=row["id"],
            event_type=row["event_type"],
            camera_id=row["camera_id"],
            video_job_id=row["video_job_id"],
            occurred_at=row["occurred_at"],
            confidence=float(row["confidence"]),
            snapshot_path=row["snapshot_path"],
            clip_path=row["clip_path"],
            details=details or {},
            created_at=row["created_at"],
        )
