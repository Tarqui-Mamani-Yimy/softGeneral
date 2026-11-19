import json
from dataclasses import dataclass
from datetime import datetime
from uuid import UUID

from sqlalchemy import text
from sqlalchemy.orm import Session


@dataclass
class CameraRecord:
    id: UUID
    code: str
    name: str
    location: str
    source_type: str
    source_url: str
    is_active: bool
    created_at: datetime
    updated_at: datetime

    @property
    def live_path(self) -> str:
        return f"{self.code}_annotated"


class CameraRepository:
    def list_cameras(self, session: Session) -> list[CameraRecord]:
        rows = session.execute(
            text("""SELECT id, code, name, location, source_type, source_url,
                           is_active, created_at, updated_at
                    FROM cameras
                    ORDER BY name ASC""")
        ).mappings().all()
        return [self._record(row) for row in rows if row is not None]

    def get_by_id(self, session: Session, camera_id: UUID) -> CameraRecord | None:
        row = session.execute(
            text("""SELECT id, code, name, location, source_type, source_url,
                           is_active, created_at, updated_at
                    FROM cameras
                    WHERE id = :id"""),
            {"id": camera_id},
        ).mappings().one_or_none()
        return self._record(row)

    def get_by_code(self, session: Session, code: str) -> CameraRecord | None:
        row = session.execute(
            text("""SELECT id, code, name, location, source_type, source_url,
                           is_active, created_at, updated_at
                    FROM cameras
                    WHERE code = :code"""),
            {"code": code},
        ).mappings().one_or_none()
        return self._record(row)

    def create(self, session: Session, user_id: UUID, **values) -> CameraRecord:
        row = session.execute(
            text("""INSERT INTO cameras (code, name, location, source_type, source_url, is_active)
                    VALUES (:code, :name, :location, CAST(:source_type AS camera_source_type), :source_url, :is_active)
                    RETURNING id, code, name, location, source_type, source_url, is_active, created_at, updated_at"""),
            {
                "code": values["code"],
                "name": values["name"],
                "location": values.get("location", ""),
                "source_type": values["source_type"],
                "source_url": values["source_url"],
                "is_active": values.get("is_active", True),
            },
        ).mappings().one()

        record = self._record(row)
        assert record is not None

        session.execute(
            text("""INSERT INTO audit_log (user_id, action, entity_type, entity_id, details)
                    VALUES (:user_id, 'camera.created', 'camera', :entity_id, CAST(:details AS jsonb))"""),
            {
                "user_id": user_id,
                "entity_id": str(record.id),
                "details": json.dumps({
                    "code": record.code,
                    "name": record.name,
                    "location": record.location,
                    "source_type": record.source_type,
                }),
            },
        )
        session.commit()
        return record

    def update(self, session: Session, camera_id: UUID, user_id: UUID, **values) -> CameraRecord | None:
        current = self.get_by_id(session, camera_id)
        if current is None:
            return None

        updates = []
        params = {"id": camera_id}
        audit_details = {}

        if "name" in values and values["name"] is not None:
            updates.append("name = :name")
            params["name"] = values["name"]
            audit_details["name"] = values["name"]

        if "location" in values and values["location"] is not None:
            updates.append("location = :location")
            params["location"] = values["location"]
            audit_details["location"] = values["location"]

        if "source_type" in values and values["source_type"] is not None:
            updates.append("source_type = CAST(:source_type AS camera_source_type)")
            params["source_type"] = values["source_type"]
            audit_details["source_type"] = values["source_type"]

        if "source_url" in values and values["source_url"] is not None:
            updates.append("source_url = :source_url")
            params["source_url"] = values["source_url"]
            audit_details["source_url"] = values["source_url"]

        if "is_active" in values and values["is_active"] is not None:
            updates.append("is_active = :is_active")
            params["is_active"] = values["is_active"]
            audit_details["is_active"] = values["is_active"]

        if not updates:
            return current

        query = f"""UPDATE cameras
                    SET {', '.join(updates)}
                    WHERE id = :id
                    RETURNING id, code, name, location, source_type, source_url, is_active, created_at, updated_at"""

        row = session.execute(text(query), params).mappings().one()
        record = self._record(row)
        assert record is not None

        session.execute(
            text("""INSERT INTO audit_log (user_id, action, entity_type, entity_id, details)
                    VALUES (:user_id, 'camera.updated', 'camera', :entity_id, CAST(:details AS jsonb))"""),
            {
                "user_id": user_id,
                "entity_id": str(camera_id),
                "details": json.dumps(audit_details),
            },
        )
        session.commit()
        return record

    def disable(self, session: Session, camera_id: UUID, user_id: UUID) -> CameraRecord | None:
        row = session.execute(
            text("""UPDATE cameras
                    SET is_active = FALSE
                    WHERE id = :id
                    RETURNING id, code, name, location, source_type, source_url, is_active, created_at, updated_at"""),
            {"id": camera_id},
        ).mappings().one_or_none()

        if row is None:
            return None

        record = self._record(row)
        assert record is not None

        session.execute(
            text("""INSERT INTO audit_log (user_id, action, entity_type, entity_id, details)
                    VALUES (:user_id, 'camera.disabled', 'camera', :entity_id, '{}'::jsonb)"""),
            {"user_id": user_id, "entity_id": str(camera_id)},
        )
        session.commit()
        return record

    @staticmethod
    def _record(row) -> CameraRecord | None:
        if row is None:
            return None
        return CameraRecord(**dict(row))
