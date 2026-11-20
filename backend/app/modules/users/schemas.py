from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field


class RoleResponse(BaseModel):
    id: int
    code: str
    name: str
    description: str


class UserListItem(BaseModel):
    id: UUID
    username: str
    email: str
    full_name: str
    role: str
    role_name: str
    is_active: bool
    last_login_at: datetime | None = None
    created_at: datetime


class UserCreateRequest(BaseModel):
    username: str = Field(min_length=3, max_length=50)
    email: str = Field(min_length=5, max_length=150)
    full_name: str = Field(min_length=2, max_length=150)
    password: str = Field(min_length=6, max_length=128)
    role: str = Field(default="guard")
    is_active: bool = True


class UserUpdateRequest(BaseModel):
    email: str | None = Field(default=None, min_length=5, max_length=150)
    full_name: str | None = Field(default=None, min_length=2, max_length=150)
    password: str | None = Field(default=None, min_length=6, max_length=128)
    role: str | None = None
    is_active: bool | None = None
