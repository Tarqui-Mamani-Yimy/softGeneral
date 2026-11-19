from datetime import datetime
from uuid import UUID

from pydantic import BaseModel


class DemoSessionResponse(BaseModel):
    """Contract of a demo session. It never carries the camera source_url."""

    id: UUID
    camera_code: str
    publish_path: str
    whip_url: str
    live_path: str
    expires_at: datetime


class DemoStreamStatus(BaseModel):
    annotated_ready: bool
