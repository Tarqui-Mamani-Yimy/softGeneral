import re
from urllib.parse import urlsplit, urlunsplit
from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field, model_validator

CameraSourceType = Literal["rtsp", "webcam", "file"]
CODE_REGEX = r"^[a-z][a-z0-9_]{1,31}$"


def validate_camera_source(source_type: str | None, source_url: str | None) -> None:
    if source_url is None:
        return
    if source_type == "rtsp":
        lower = source_url.lower()
        if not (lower.startswith("rtsp://") or lower.startswith("rtsps://")):
            raise ValueError("source_url must start with rtsp:// or rtsps:// for rtsp cameras")
    elif source_type == "webcam":
        if not re.match(r"^\d+$", source_url.strip()):
            raise ValueError("source_url must be digits representing device index for webcam cameras")


def redact_url_credentials(url: str) -> str:
    """Return the URL without user and password, for logs and the audit trail."""
    parts = urlsplit(url)
    if parts.username is None and parts.password is None:
        return url
    host = parts.hostname or ""
    if parts.port is not None:
        host = f"{host}:{parts.port}"
    return urlunsplit((parts.scheme, f"***@{host}", parts.path, parts.query, parts.fragment))


class CameraCreateRequest(BaseModel):
    code: str = Field(..., pattern=CODE_REGEX)
    name: str = Field(..., min_length=1, max_length=255)
    location: str = Field(default="", max_length=255)
    source_type: CameraSourceType
    source_url: str = Field(..., min_length=1, max_length=1000)

    @model_validator(mode="after")
    def check_source_url(self) -> "CameraCreateRequest":
        validate_camera_source(self.source_type, self.source_url)
        return self


class CameraUpdateRequest(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=255)
    location: str | None = Field(default=None, max_length=255)
    source_type: CameraSourceType | None = None
    source_url: str | None = Field(default=None, min_length=1, max_length=1000)
    is_active: bool | None = None

    @model_validator(mode="after")
    def check_source_url(self) -> "CameraUpdateRequest":
        if self.source_url is not None and self.source_type is not None:
            validate_camera_source(self.source_type, self.source_url)
        return self


class CameraResponse(BaseModel):
    id: UUID
    code: str
    name: str
    location: str
    source_type: str
    source_url: str | None = None
    live_path: str
    is_active: bool
    created_at: datetime
    updated_at: datetime
