from dataclasses import dataclass
from uuid import UUID

from sqlalchemy import text


@dataclass(frozen=True)
class CameraRecord:
    id: UUID
    code: str
    source_type: str
    source_url: str


class CameraRepository:
    def list_active(self, session):
        rows = session.execute(text("SELECT id, code, source_type, source_url FROM cameras WHERE is_active ORDER BY code")).mappings().all()
        return [CameraRecord(**dict(row)) for row in rows]

    def get_active_by_code(self, session, code: str):
        row = session.execute(text("SELECT id, code, source_type, source_url FROM cameras WHERE code = :code AND is_active"), {"code": code}).mappings().one_or_none()
        return CameraRecord(**dict(row)) if row else None
