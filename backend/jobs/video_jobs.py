from __future__ import annotations

import re
from pathlib import Path
from threading import Event
from time import monotonic

from app.modules.videos.repository import VideoJobRecord, VideoRepository


class StopRequested(Exception):
    """Raised after the current pipeline frame when shutdown was requested."""


def safe_error_message(error: Exception, input_path: str) -> str:
    message = str(error).replace(input_path, Path(input_path).name)
    message = re.sub(r"(?<![\w:])/(?:[^\s]+)", lambda match: Path(match.group(0)).name, message)
    return message[:500] or "Video processing failed"


class VideoJobRunner:
    def __init__(
        self,
        session_factory,
        settings,
        repository: VideoRepository | None = None,
        pipeline=None,
        source_factory=None,
        writer_factory=None,
        analyzer_factory=None,
    ):
        self.session_factory = session_factory
        self.settings = settings
        self.repository = repository or VideoRepository()
        if pipeline is None:
            from vision.pipeline import process_video

            pipeline = process_video
        if source_factory is None:
            from vision.sources.file import FileSource

            source_factory = FileSource
        if writer_factory is None:
            from vision.annotation.writer import VideoWriter

            writer_factory = VideoWriter
        self.pipeline = pipeline
        self.source_factory = source_factory
        self.writer_factory = writer_factory
        self.analyzer_factory = analyzer_factory or self._default_analyzers

    def recover_processing(self) -> None:
        with self.session_factory() as session:
            self.repository.requeue_processing(session)
            session.commit()

    def claim_next(self) -> VideoJobRecord | None:
        with self.session_factory() as session:
            job = self.repository.claim_next(session)
            session.commit()
            return job

    def run_once(self, stop_event: Event | None = None) -> bool:
        job = self.claim_next()
        if job is None:
            return False
        stop_event = stop_event or Event()
        output_path = Path(self.settings.storage_dir) / "outputs" / f"{job.id}.mp4"
        try:
            with self.source_factory(job.input_path) as source, self.writer_factory(output_path, source.fps, source.frame_size) as writer:
                self.pipeline(
                    source,
                    writer,
                    self.analyzer_factory(),
                    stride=self.settings.worker_stride,
                    on_progress=self._progress_callback(job.id, stop_event),
                )
            self._update(lambda session: self.repository.complete(session, job.id, str(output_path.resolve())))
        except StopRequested:
            output_path.unlink(missing_ok=True)
            self._update(lambda session: self.repository.requeue(session, job.id))
        except Exception as error:
            output_path.unlink(missing_ok=True)
            message = safe_error_message(error, job.input_path)
            self._update(lambda session: self.repository.fail(session, job.id, message))
        return True

    def _progress_callback(self, job_id, stop_event: Event):
        last_progress = -1
        last_written = monotonic()

        def callback(progress: int):
            nonlocal last_progress, last_written
            if stop_event.is_set():
                raise StopRequested
            now = monotonic()
            if progress == 100 or progress - last_progress >= 5 or now - last_written >= 2:
                self._update(lambda session: self.repository.update_progress(session, job_id, progress))
                last_progress = progress
                last_written = now

        return callback

    def _update(self, operation) -> None:
        with self.session_factory() as session:
            operation(session)
            session.commit()

    def _default_analyzers(self):
        from vision.detection.registry import ModelRegistry
        from vision.detection.tracker import PersonTracker

        registry = ModelRegistry()
        analyzers = []
        for name in (item.strip() for item in self.settings.worker_models.split(",")):
            if not name:
                continue
            analyzers.append(PersonTracker() if name == "person" else registry.load(name))
        return analyzers
