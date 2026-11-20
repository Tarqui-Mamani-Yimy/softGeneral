from datetime import datetime
from typing import Any
from uuid import UUID

from pydantic import BaseModel, Field


class SportsEventResponse(BaseModel):
    id: UUID
    event_type: str
    confidence: float
    occurred_at: datetime
    camera_id: UUID | None = None
    video_job_id: UUID | None = None
    details: dict[str, Any] = Field(default_factory=dict)
    has_snapshot: bool
    created_at: datetime


class SportsSummaryResponse(BaseModel):
    total_events: int
    total_ball_events: int
    total_formation_events: int
    total_referee_events: int
    events: list[SportsEventResponse]
