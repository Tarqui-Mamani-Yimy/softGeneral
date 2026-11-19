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
    mediamtx_publish_url: str = "rtsp://127.0.0.1:8554"
    live_analysis_stride: int = 3
    live_metrics_seconds: float = 10.0
    # Browser demo: where the worker reads the published stream and where the
    # browser publishes it (WHIP over WebRTC).
    mediamtx_rtsp_read_url: str = "rtsp://127.0.0.1:8554"
    demo_whip_base_url: str = "http://localhost:8889"
    # MediaMTX control API, used server-side to know when an annotated stream is live.
    mediamtx_api_url: str = "http://127.0.0.1:9997"
    demo_max_minutes: int = 10
    live_watch_seconds: float = 3.0
