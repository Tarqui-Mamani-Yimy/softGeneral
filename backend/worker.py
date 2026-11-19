"""Separate process entrypoint for queued video jobs."""

import argparse
import logging
import signal
from threading import Event

logger = logging.getLogger("softgeneral.worker")


def main(argv=None) -> None:
    parser = argparse.ArgumentParser(description="Process queued softGeneral video jobs")
    parser.add_argument("--once", action="store_true", help="process at most one queued job")
    args = parser.parse_args(argv)
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
    from app.core.config import Settings
    from app.core.database import build_engine, build_session_factory
    from jobs.video_jobs import VideoJobRunner

    settings = Settings()
    runner = VideoJobRunner(build_session_factory(build_engine(settings.database_url)), settings)
    runner.recover_processing()
    stop_event = Event()
    signal.signal(signal.SIGINT, lambda *_: stop_event.set())
    signal.signal(signal.SIGTERM, lambda *_: stop_event.set())
    logger.info("worker started")
    if args.once:
        runner.run_once(stop_event)
        return
    while not stop_event.is_set():
        runner.run_once(stop_event)
        stop_event.wait(settings.worker_poll_seconds)


if __name__ == "__main__":
    main()
