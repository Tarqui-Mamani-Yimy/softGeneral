from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Application settings read from environment variables or a .env file.

    The repository-root .env (shared with docker-compose) is read when the API
    runs from backend/.
    """

    model_config = SettingsConfigDict(env_file=(".env", "../.env"), extra="ignore")

    app_name: str = "softGeneral API"
    app_env: str = "development"
    database_url: str = "postgresql+psycopg://softgeneral:change-me@localhost:5432/softgeneral"
    jwt_secret: str | None = None
    jwt_expire_minutes: int = 60
    # Never "*": the API will send credentials (JWT) from the browser.
    cors_origins: list[str] = ["http://localhost:5173"]
    storage_dir: str = "../datos"
    max_upload_mb: int = 500
