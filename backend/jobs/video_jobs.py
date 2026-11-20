from __future__ import annotations

import re
import logging
import inspect
from datetime import UTC, datetime, timedelta
from pathlib import Path
from threading import Event
from time import monotonic

from app.modules.videos.repository import VideoJobRecord, VideoRepository

logger = logging.getLogger(__name__)


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
        alert_repository=None,
        source_factory=None,
        writer_factory=None,
        analyzer_factory=None,
        rules_factory=None,
        evidence_factory=None,
    ):
        self.session_factory = session_factory
        self.settings = settings
        self.repository = repository or VideoRepository()
        if alert_repository is None:
            from app.modules.alerts.repository import AlertRepository

            alert_repository = AlertRepository()
        self.alert_repository = alert_repository
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
        self.rules_factory = rules_factory or self._default_rules_engine
        if evidence_factory is None:
            from vision.evidence.recorder import EvidenceRecorder

            evidence_factory = EvidenceRecorder
        self.evidence_factory = evidence_factory

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
        evidence = None
        try:
            with self.source_factory(job.input_path) as source, self.writer_factory(output_path, source.fps, source.frame_size) as writer:
                evidence = self.evidence_factory(
                    self.settings.storage_dir,
                    job.id,
                    source.fps,
                    source.frame_size,
                    getattr(self.settings, "worker_clip_before_seconds", 3.0),
                    getattr(self.settings, "worker_clip_after_seconds", 3.0),
                )
                pipeline_kwargs = {
                    "stride": self.settings.worker_stride,
                    "on_progress": self._progress_callback(job.id, stop_event),
                }
                parameters = inspect.signature(self.pipeline).parameters
                supports_rules = "rules_engine" in parameters or any(parameter.kind == inspect.Parameter.VAR_KEYWORD for parameter in parameters.values())
                if supports_rules and hasattr(self.settings, "worker_rules_file"):
                    pipeline_kwargs.update({
                        "rules_engine": self.rules_factory(),
                        "evidence": evidence,
                        "on_alert": lambda event, frame: self._record_alert(job, event, frame, evidence),
                    })
                self.pipeline(source, writer, self.analyzer_factory(), **pipeline_kwargs)
            self._update(lambda session: self.repository.complete(session, job.id, str(output_path.resolve())))
        except StopRequested:
            if evidence is not None:
                evidence.cleanup()
            self._update(lambda session: self.alert_repository.delete_for_video_job(session, job.id))
            output_path.unlink(missing_ok=True)
            self._update(lambda session: self.repository.requeue(session, job.id))
        except Exception as error:
            if evidence is not None:
                evidence.cleanup()
            output_path.unlink(missing_ok=True)
            message = safe_error_message(error, job.input_path)
            self._update(lambda session: self.repository.fail(session, job.id, message))
        return True

    def _record_alert(self, job, event, frame, evidence) -> None:
        from uuid import uuid4

        alert_id = uuid4()
        snapshot_path, clip_path = evidence.start_alert(event, alert_id, frame)
        started_at = getattr(job, "started_at", None) or datetime.now(UTC)
        details = {
            **event.details,
            "zone": event.zone,
            "bbox": list(event.bbox),
            "frame_index": event.frame_index,
            "timestamp_s": event.timestamp_s,
            "model_names": [item.strip() for item in self.settings.worker_models.split(",") if item.strip()],
        }
        self._update(lambda session: self.alert_repository.create_alert(
            session,
            id=alert_id,
            alert_type=event.alert_type,
            video_job_id=job.id,
            occurred_at=started_at + timedelta(seconds=event.timestamp_s),
            confidence=event.confidence,
            track_id=event.track_id,
            snapshot_path=snapshot_path,
            clip_path=clip_path,
            details=details,
        ))

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

    def _default_rules_engine(self):
        from vision.rules.config import RuleConfig, load_rules_config
        from vision.rules.engine import RulesEngine
        from vision.rules.zones import ZoneMap

        rules_path = Path(self.settings.worker_rules_file)
        zones_path = Path(self.settings.worker_zones_file)
        rule_config = RuleConfig()
        if rules_path.exists():
            import yaml

            with rules_path.open(encoding="utf-8") as handle:
                raw = yaml.safe_load(handle) or {}
            rule_config = RuleConfig(
                intrusion_min_frames=raw.get("intrusion", {}).get("min_frames", rule_config.intrusion_min_frames),
                unknown_origin_alerts=raw.get("intrusion", {}).get("unknown_origin_alerts", rule_config.unknown_origin_alerts),
                fire_smoke_k=raw.get("fire_smoke", {}).get("k", rule_config.fire_smoke_k),
                fire_smoke_n=raw.get("fire_smoke", {}).get("n", rule_config.fire_smoke_n),
                fire_smoke_confidence=raw.get("fire_smoke", {}).get("confidence", rule_config.fire_smoke_confidence),
                fire_ignore_zones=tuple(raw.get("fire_smoke", {}).get("ignore_zones", rule_config.fire_ignore_zones)),
                weapon_k=raw.get("weapon", {}).get("k", rule_config.weapon_k),
                weapon_n=raw.get("weapon", {}).get("n", rule_config.weapon_n),
                weapon_confidence=raw.get("weapon", {}).get("confidence", rule_config.weapon_confidence),
                fight_k=raw.get("fight", {}).get("k", rule_config.fight_k),
                fight_n=raw.get("fight", {}).get("n", rule_config.fight_n),
                fight_confidence=raw.get("fight", {}).get("confidence", rule_config.fight_confidence),
                cooldown_seconds=raw.get("cooldown_seconds", rule_config.cooldown_seconds),
                forget_after_seconds=raw.get("forget_after_seconds", rule_config.forget_after_seconds),
            )
        if rules_path.exists() and zones_path.exists():
            loaded = load_rules_config(rules_path, zones_path)
            return RulesEngine(loaded.zones, loaded.rules)
        logger.warning("Zones file missing; running weapon and fire/smoke rules without zone rules")
        return RulesEngine(ZoneMap([]), rule_config)
