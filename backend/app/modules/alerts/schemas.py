from datetime import datetime
from typing import Any, Literal
from uuid import UUID

from pydantic import BaseModel, Field


class AlertReviewRequest(BaseModel):
    status: Literal["confirmed", "false_alarm"]
    notes: str | None = Field(default=None, max_length=1000)


class AlertResponse(BaseModel):
    id: UUID
    alert_type: str
    status: str
    confidence: float
    occurred_at: datetime
    camera_id: UUID | None = None
    video_job_id: UUID | None = None
    track_id: int | None = None
    details: dict[str, Any] = Field(default_factory=dict)
    has_snapshot: bool
    has_clip: bool
    reviewed_by: UUID | None = None
    reviewed_at: datetime | None = None
    review_notes: str | None = None
    created_at: datetime
