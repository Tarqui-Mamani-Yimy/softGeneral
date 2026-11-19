from datetime import datetime
from uuid import UUID

from pydantic import BaseModel


class VideoJobResponse(BaseModel):
    id: UUID
    original_filename: str
    status: str
    progress: float
    created_at: datetime
