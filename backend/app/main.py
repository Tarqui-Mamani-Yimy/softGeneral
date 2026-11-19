import asyncio
import json
import logging
from contextlib import asynccontextmanager
from uuid import UUID

import psycopg
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import Settings
from app.core.database import build_engine, build_session_factory
from app.modules.alerts.broadcaster import AlertBroadcaster
from app.modules.alerts.dependencies import get_alert_repository
from app.modules.alerts.router import router as alerts_router
from app.modules.auth.dependencies import get_user_repository
from app.modules.auth.router import router as auth_router
from app.modules.cameras.router import router as cameras_router
from app.modules.health.router import router as health_router
from app.modules.videos.router import router as videos_router

logger = logging.getLogger(__name__)

API_PREFIX = "/api/v1"


async def run_alerts_listener(app: FastAPI, stop_event: asyncio.Event) -> None:
    settings: Settings = app.state.settings
    conn_str = settings.database_url.replace("postgresql+psycopg://", "postgresql://")
    if not conn_str.startswith("postgresql://"):
        return

    backoff = 1.0
    max_backoff = 30.0

    while not stop_event.is_set():
        conn = None
        try:
            conn = await psycopg.AsyncConnection.connect(conn_str, autocommit=True)
            await conn.execute("LISTEN alerts")
            backoff = 1.0
            async for notify in conn.notifies():
                if stop_event.is_set():
                    break
                try:
                    payload = json.loads(notify.payload)
                    alert_id = UUID(str(payload.get("id")))
                except Exception:
                    continue

                alert_repo = app.dependency_overrides.get(get_alert_repository, get_alert_repository)()
                session_factory = app.state.session_factory
                record = None

                def load_alert():
                    with session_factory() as session:
                        return alert_repo.get_by_id(session, alert_id)

                try:
                    # Blocking DB call: keep it off the event loop.
                    record = await asyncio.to_thread(load_alert)
                except Exception as db_err:
                    logger.debug("Failed to load alert %s from DB: %s", alert_id, db_err)

                if record is not None:
                    broadcaster: AlertBroadcaster = app.state.alert_broadcaster
                    await broadcaster.broadcast_alert_record(record)
        except asyncio.CancelledError:
            break
        except Exception as exc:
            logger.debug("Alerts listener connection failed (%s), retrying in %.1fs", exc, backoff)
            try:
                await asyncio.wait_for(stop_event.wait(), timeout=backoff)
                break
            except asyncio.TimeoutError:
                pass
            backoff = min(backoff * 2, max_backoff)
        finally:
            if conn is not None and not conn.closed:
                try:
                    await conn.close()
                except Exception:
                    pass


@asynccontextmanager
async def lifespan(app: FastAPI):
    stop_event = asyncio.Event()
    listener_task = asyncio.create_task(run_alerts_listener(app, stop_event))
    try:
        yield
    finally:
        stop_event.set()
        listener_task.cancel()
        try:
            await asyncio.wait_for(listener_task, timeout=2.0)
        except (asyncio.CancelledError, asyncio.TimeoutError, Exception):
            pass


def create_app(settings: Settings | None = None) -> FastAPI:
    settings = settings or Settings()
    if not settings.jwt_secret:
        raise ValueError("JWT_SECRET is required")
    if len(settings.jwt_secret) < 32:
        raise ValueError("JWT_SECRET must be at least 32 characters")
    app = FastAPI(title=settings.app_name, lifespan=lifespan)

    app.state.settings = settings
    app.state.engine = build_engine(settings.database_url)
    app.state.session_factory = build_session_factory(app.state.engine)
    app.state.alert_broadcaster = AlertBroadcaster(
        session_factory=app.state.session_factory,
        user_repository_factory=lambda: app.dependency_overrides.get(get_user_repository, get_user_repository)(),
    )

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
    app.include_router(alerts_router, prefix=API_PREFIX)
    app.include_router(cameras_router, prefix=API_PREFIX)
    return app
