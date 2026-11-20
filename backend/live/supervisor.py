from __future__ import annotations

import json
import logging
import threading
import time
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from uuid import UUID

from sqlalchemy import text

logger = logging.getLogger(__name__)

DEMO_CODE_PREFIX = "demo_"
WATCHED_SOURCE_TYPES = ("rtsp", "webcam")
MAX_BACKOFF_SECONDS = 30.0
STABLE_RUN_SECONDS = 60.0


@dataclass(frozen=True)
class WatchedCamera:
    id: UUID
    code: str
    source_type: str
    source_url: str
    created_at: datetime


class WatchRepository:
    """Camera queries used by the watcher. Each call runs inside the caller's session."""

    def list_watchable(self, session):
        rows = session.execute(
            text("""SELECT id, code, source_type, source_url, created_at
                    FROM cameras
                    WHERE is_active AND source_type IN ('rtsp', 'webcam')
                    ORDER BY code""")
        ).mappings().all()
        return [WatchedCamera(**dict(row)) for row in rows]

    def expire_demo(self, session, camera_id):
        """Disable an expired demo camera as a system action (audit user_id is NULL)."""
        row = session.execute(
            text("""UPDATE cameras SET is_active = FALSE
                    WHERE id = :id AND is_active AND left(code, 5) = 'demo_'
                    RETURNING id"""),
            {"id": camera_id},
        ).first()
        if row is None:
            return False
        session.execute(
            text("""INSERT INTO audit_log (user_id, action, entity_type, entity_id, details)
                    VALUES (NULL, 'camera.disabled', 'camera', :entity_id, CAST(:details AS jsonb))"""),
            {"entity_id": str(camera_id), "details": json.dumps({"reason": "demo_expired"})},
        )
        session.commit()
        return True


@dataclass
class _Managed:
    camera: WatchedCamera
    thread: threading.Thread
    stop_event: threading.Event
    started_at: float


class LiveSupervisor:
    """Keeps one runner thread per active rtsp/webcam camera.

    runner_factory(camera, stop_event) returns a zero-argument callable that
    blocks while the camera is processed (it must return when stop_event is set).
    """

    def __init__(self, repository, session_factory, runner_factory, demo_max_minutes: int = 10, monotonic=time.monotonic, join_timeout: float = 10.0):
        self.repository = repository
        self.session_factory = session_factory
        self.runner_factory = runner_factory
        self.demo_max_minutes = demo_max_minutes
        self.monotonic = monotonic
        self.join_timeout = join_timeout
        self.runners: dict[str, _Managed] = {}
        self._failures: dict[str, int] = {}
        self._retry_at: dict[str, float] = {}

    def poll(self) -> None:
        try:
            with self.session_factory() as session:
                cameras = self.repository.list_watchable(session)
                cameras = self._expire_demos(session, cameras)
        except Exception:
            logger.exception("Camera watch poll failed; keeping current runners")
            return
        wanted = {camera.code: camera for camera in cameras}
        for code in [code for code in self.runners if code not in wanted]:
            logger.info("Stopping runner for camera %s (no longer active)", code)
            self._stop_runner(code)
        for code in [code for code, managed in self.runners.items() if managed.camera.source_url != wanted[code].source_url]:
            logger.info("Restarting runner for camera %s (source changed)", code)
            self._stop_runner(code)
        for code in [code for code in self._retry_at if code not in wanted]:
            self._forget(code)
        for code, camera in wanted.items():
            managed = self.runners.get(code)
            if managed is not None and not managed.thread.is_alive():
                self._on_runner_died(code, managed)
                managed = None
            if managed is None and self.monotonic() >= self._retry_at.get(code, 0.0):
                self._start_runner(camera)

    def run_forever(self, stop: threading.Event, interval: float) -> None:
        try:
            while not stop.is_set():
                self.poll()
                stop.wait(interval)
        finally:
            self.stop()

    def stop(self) -> None:
        for managed in self.runners.values():
            managed.stop_event.set()
        for code, managed in self.runners.items():
            managed.thread.join(timeout=self.join_timeout)
            if managed.thread.is_alive():
                logger.warning("Runner for camera %s did not stop within %.1fs", code, self.join_timeout)
        self.runners.clear()

    def _expire_demos(self, session, cameras):
        limit = datetime.now(UTC) - timedelta(minutes=self.demo_max_minutes)
        alive = []
        for camera in cameras:
            if camera.code.startswith(DEMO_CODE_PREFIX) and camera.created_at < limit:
                logger.info("Demo camera %s expired; disabling it", camera.code)
                self.repository.expire_demo(session, camera.id)
            else:
                alive.append(camera)
        return alive

    def _start_runner(self, camera: WatchedCamera) -> None:
        stop_event = threading.Event()
        run = self.runner_factory(camera, stop_event)

        def target():
            try:
                run()
            except Exception:
                logger.exception("Runner for camera %s crashed", camera.code)

        thread = threading.Thread(target=target, name=f"live-{camera.code}", daemon=True)
        self.runners[camera.code] = _Managed(camera, thread, stop_event, self.monotonic())
        thread.start()
        logger.info("Started runner for camera %s", camera.code)

    def _stop_runner(self, code: str) -> None:
        managed = self.runners.pop(code)
        managed.stop_event.set()
        managed.thread.join(timeout=self.join_timeout)
        if managed.thread.is_alive():
            logger.warning("Runner for camera %s did not stop within %.1fs", code, self.join_timeout)
        self._forget(code)

    def _forget(self, code: str) -> None:
        self._failures.pop(code, None)
        self._retry_at.pop(code, None)

    def _on_runner_died(self, code: str, managed: _Managed) -> None:
        now = self.monotonic()
        del self.runners[code]
        if now - managed.started_at >= STABLE_RUN_SECONDS:
            self._failures[code] = 0
        failures = self._failures.get(code, 0) + 1
        self._failures[code] = failures
        delay = min(2.0 ** failures, MAX_BACKOFF_SECONDS)
        self._retry_at[code] = now + delay
        logger.warning("Runner for camera %s stopped; restarting in %.0fs", code, delay)
