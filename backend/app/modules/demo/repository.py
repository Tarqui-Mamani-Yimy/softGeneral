from sqlalchemy import text
from sqlalchemy.orm import Session

from app.modules.cameras.repository import CameraRecord

DEMO_CODE_PREFIX = "demo_"


class DemoRepository:
    """Read-side queries for demo cameras. Writes go through CameraRepository."""

    def list_active_demo(self, session: Session) -> list[CameraRecord]:
        rows = session.execute(
            text("""SELECT id, code, name, location, source_type, source_url,
                           is_active, created_at, updated_at
                    FROM cameras
                    WHERE is_active AND left(code, 5) = 'demo_'
                    ORDER BY created_at DESC""")
        ).mappings().all()
        return [CameraRecord(**dict(row)) for row in rows]
