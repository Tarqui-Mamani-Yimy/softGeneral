from __future__ import annotations

import argparse
import logging
import signal
import threading

from app.core.config import Settings
from app.core.database import build_engine, build_session_factory
from live.cameras import CameraRepository
from live.publisher import RTSPPublisher
from live.runner import LiveCameraRunner
from live.supervisor import LiveSupervisor, WatchRepository
from vision.detection.registry import ModelRegistry
from vision.detection.tracker import PersonTracker

logger = logging.getLogger("softgeneral.live_worker")


def build_runner(camera, settings, factory):
    def analyzers():
        registry = ModelRegistry()
        names = [item.strip() for item in settings.worker_models.split(",") if item.strip()]
        return [PersonTracker() if name == "person" else registry.load(name) for name in names]
    runner = LiveCameraRunner(camera, settings, factory, source_factory=lambda url: __import__("vision.sources.rtsp", fromlist=["RTSPSource"]).RTSPSource(int(url) if camera.source_type == "webcam" else url), publisher_factory=lambda code, fps, size: RTSPPublisher(settings.mediamtx_publish_url, code, fps, size))
    runner.analyzer_factory = analyzers
    return runner


def watch(settings, factory):
    stop = threading.Event()
    signal.signal(signal.SIGINT, lambda *_: stop.set())
    signal.signal(signal.SIGTERM, lambda *_: stop.set())
    supervisor = LiveSupervisor(
        repository=WatchRepository(),
        session_factory=factory,
        runner_factory=lambda camera, stop_event: (lambda: build_runner(camera, settings, factory).run(stop_event)),
        demo_max_minutes=settings.demo_max_minutes,
    )
    logger.info("Watching cameras every %.1fs", settings.live_watch_seconds)
    supervisor.run_forever(stop, settings.live_watch_seconds)


def main(argv=None):
    parser = argparse.ArgumentParser()
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument("--camera")
    group.add_argument("--all", action="store_true")
    group.add_argument("--watch", action="store_true", help="supervise cameras: start/stop runners as cameras change and expire demo cameras")
    args = parser.parse_args(argv)
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
    settings = Settings()
    factory = build_session_factory(build_engine(settings.database_url))
    if args.watch:
        return watch(settings, factory)
    with factory() as session:
        repository = CameraRepository()
        cameras = repository.list_active(session) if args.all else [repository.get_active_by_code(session, args.camera)]
    cameras = [camera for camera in cameras if camera is not None and camera.source_type in {"rtsp", "webcam"}]
    stop = threading.Event()
    signal.signal(signal.SIGINT, lambda *_: stop.set())
    signal.signal(signal.SIGTERM, lambda *_: stop.set())

    def run(camera):
        build_runner(camera, settings, factory).run(stop)

    threads = [threading.Thread(target=run, args=(camera,), daemon=True) for camera in cameras]
    for thread in threads: thread.start()
    while any(thread.is_alive() for thread in threads):
        for thread in threads: thread.join(timeout=0.2)


if __name__ == "__main__":
    main()
