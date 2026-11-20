from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field

SeverityLevel = Literal["high", "medium", "low"]


class BannedPersonResponse(BaseModel):
    id: UUID
    full_name: str
    document_id: str | None = None
    reason: str
    severity: SeverityLevel
    photo_url: str
    is_active: bool
    banned_at: datetime
    notes: str | None = None
    created_at: datetime
    updated_at: datetime


class BannedPersonUpdateRequest(BaseModel):
    full_name: str | None = Field(default=None, min_length=1, max_length=255)
    document_id: str | None = Field(default=None, max_length=100)
    reason: str | None = Field(default=None, min_length=1)
    severity: SeverityLevel | None = None
    notes: str | None = None
    is_active: bool | None = None

