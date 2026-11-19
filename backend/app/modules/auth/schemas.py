from pydantic import BaseModel, Field, model_validator


class LoginRequest(BaseModel):
    password: str
    identifier: str | None = None
    username: str | None = None
    email: str | None = None

    @model_validator(mode="after")
    def has_identifier(self):
        if not (self.identifier or self.username or self.email):
            raise ValueError("username, email or identifier is required")
        return self

    @property
    def login_identifier(self) -> str:
        return self.identifier or self.username or self.email or ""


class UserResponse(BaseModel):
    id: str
    username: str
    full_name: str
    role: str
    permissions: list[str] = Field(default_factory=list)


class LoginResponse(BaseModel):
    access_token: str
    token_type: str
    user: UserResponse
