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
    worker_poll_seconds: float = 2.0
    worker_stride: int = 2
    worker_models: str = "person,armas,fuegoHumo"
    worker_rules_file: str = "../config/rules.yaml"
    worker_zones_file: str = "../config/zones/example.json"
    worker_clip_before_seconds: float = 3.0
    worker_clip_after_seconds: float = 3.0
    ffmpeg_binary: str = "ffmpeg"
    video_transcode_h264: bool = True
    ffmpeg_timeout_seconds: float = 120.0
