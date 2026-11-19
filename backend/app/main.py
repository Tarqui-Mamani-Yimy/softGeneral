from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import Settings
from app.core.database import build_engine, build_session_factory
from app.modules.auth.router import router as auth_router
from app.modules.health.router import router as health_router
from app.modules.videos.router import router as videos_router

API_PREFIX = "/api/v1"


def create_app(settings: Settings | None = None) -> FastAPI:
    settings = settings or Settings()
    if not settings.jwt_secret:
        raise ValueError("JWT_SECRET is required")
    if len(settings.jwt_secret) < 32:
        raise ValueError("JWT_SECRET must be at least 32 characters")
    app = FastAPI(title=settings.app_name)

    app.state.settings = settings
    app.state.engine = build_engine(settings.database_url)
    app.state.session_factory = build_session_factory(app.state.engine)

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    app.include_router(health_router, prefix=API_PREFIX)
    app.include_router(auth_router, prefix=API_PREFIX)
    app.include_router(videos_router, prefix=API_PREFIX)
    return app
