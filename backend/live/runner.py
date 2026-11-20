from __future__ import annotations

import json
import logging
import threading
from concurrent.futures import ThreadPoolExecutor
from collections import deque
import time
from datetime import UTC, datetime
from pathlib import Path
from time import perf_counter
from uuid import uuid4

from sqlalchemy import text
from app.modules.demo.repository import DEMO_CODE_PREFIX
from live.repository import LiveAlertRepository
from live.stats import DbStatsPublisher
from vision.annotation.draw import draw_detections
from vision.evidence.recorder import EvidenceRecorder
from vision.face.recognizer import FaceRecognitionEngine
from vision.rules.config import RuleConfig, load_rules_config
from vision.rules.engine import RulesEngine
from vision.rules.zones import ZoneMap

logger = logging.getLogger(__name__)


class LiveSummary:
    def __init__(self):
        self.frames_read = 0
        self.frames_analyzed = 0
        self.analysis_fps = 0.0


class _LatestAnalyzer:
    def __init__(self, analyzers, rules, stride, frame_size, session_factory=None):
        self.analyzers = analyzers
        self.rules = rules
        self.stride = stride
        self.frame_size = frame_size
        self.session_factory = session_factory
        self.condition = threading.Condition()
        self.latest = None
        self.results = []
        self.face_matches = []
        self.events = deque()
        self.stop = False
        self.submitted = 0
        self.analyzed = 0
        self._face_engine: FaceRecognitionEngine | None = None
        self._candidates: list[dict] = []
        self._last_candidates_load = 0.0
        self.thread = threading.Thread(target=self._run, name="live-analysis", daemon=True)

    def start(self): self.thread.start()

    def submit(self, frame, timestamp_s, capture_timestamp):
        with self.condition:
            self.submitted += 1
            if (self.submitted - 1) % self.stride == 0:
                self.latest = (frame.copy(), timestamp_s, capture_timestamp)
                self.condition.notify()

    def drain(self):
        with self.condition:
            events = list(self.events)
            self.events.clear()
            return self.results.copy(), events, self.face_matches.copy()

    def close(self):
        with self.condition:
            self.stop = True
            self.condition.notify_all()
        self.thread.join(timeout=2)

    def _load_candidates(self):
        now = time.time()
        if self.session_factory and (now - self._last_candidates_load > 6.0 or not self._candidates):
            try:
                session_ctx = self.session_factory()
                if session_ctx:
                    with session_ctx as session:
                        rows = session.execute(
                            text("SELECT id, full_name, reason, severity, face_encoding FROM banned_persons WHERE is_active = TRUE")
                        ).mappings().all()
                        self._candidates = [
                            {
                                "id": str(r["id"]),
                                "full_name": r["full_name"],
                                "reason": r["reason"],
                                "severity": r["severity"],
                                "face_encoding": r["face_encoding"] if isinstance(r["face_encoding"], list) else json.loads(r["face_encoding"]),
                            }
                            for r in rows
                        ]
                        self._last_candidates_load = now
            except Exception as exc:
                logger.debug("Failed to query banned persons: %s", exc)

    def _run(self):
        try:
            self._face_engine = FaceRecognitionEngine()
        except Exception as e:
            logger.debug("Face recognition engine not available: %s", e)

        while True:
            with self.condition:
                while self.latest is None and not self.stop:
                    self.condition.wait(0.1)
                if self.stop and self.latest is None:
                    return
                item = self.latest
                self.latest = None
            frame, timestamp_s, capture_timestamp = item
            detections = []
            for analyzer in self.analyzers:
                detections.extend(analyzer.analyze(frame))

            face_matches = []
            self._load_candidates()
            if self._face_engine and self._candidates:
                try:
                    face_matches = self._face_engine.find_matches(frame, self._candidates)
                except Exception as exc:
                    logger.debug("Face match error: %s", exc)

            annotated = draw_detections(frame.copy(), detections, face_matches=face_matches)
            events = self.rules.update(
                self.analyzed,
                timestamp_s,
                self.frame_size,
                [d for d in detections if d.label == "person"],
                [d for d in detections if d.label != "person"],
                face_matches=face_matches,
            )
            with self.condition:
                self.results = detections
                self.face_matches = face_matches
                self.events.extend((event, annotated, capture_timestamp) for event in events)
                self.analyzed += 1


class LiveCameraRunner:
    def __init__(self, camera, settings, session_factory, alert_repository=None, source_factory=None, publisher_factory=None, analyzer_factory=None, rules_factory=None, evidence_factory=None, stats_publisher=None):
        self.camera = camera
        self.settings = settings
        self.session_factory = session_factory
        self.alert_repository = alert_repository or LiveAlertRepository()
        self.source_factory = source_factory
        self.publisher_factory = publisher_factory
        self.analyzer_factory = analyzer_factory
        self.rules_factory = rules_factory or self._rules
        self.evidence_factory = evidence_factory or EvidenceRecorder
        self.stats_publisher = stats_publisher or DbStatsPublisher(session_factory)
        self.last_frame_to_alert_ms = 0.0
        self.last_alert_latency_ms = None

    def run(self, stop_event=None):
        summary = LiveSummary()
        started = perf_counter()
        source = self.source_factory(self.camera.source_url)
        with source as source:
            # Cameras may report 0x0 until their first keyframe, so the publisher,
            # evidence and rules are sized from the first decoded frame.
            pending_frame = self._wait_first_frame(source, stop_event)
            if pending_frame is None:
                return summary
            frame_size = (int(pending_frame.shape[1]), int(pending_frame.shape[0]))
            if hasattr(source, "refresh_fps"):
                source.refresh_fps()
            fps = source.fps
            publisher = self.publisher_factory(self.camera.code, fps, frame_size)
            with publisher:
                evidence = self.evidence_factory(Path(self.settings.storage_dir) / "alerts" / "live", self.camera.code, fps, frame_size, getattr(self.settings, "worker_clip_before_seconds", 3), getattr(self.settings, "worker_clip_after_seconds", 3))
                analysis = _LatestAnalyzer(self.analyzer_factory(), self.rules_factory(), getattr(self.settings, "live_analysis_stride", 3), frame_size, session_factory=self.session_factory)
                analysis.start()
                last_detections = []
                last_face_matches = []
                published_frames = 0
                metrics_started = perf_counter()
                last_metrics = metrics_started
                next_publish = perf_counter()
                stats_interval = getattr(self.settings, "live_stats_seconds", 2.0)
                stats_window = (metrics_started, 0, 0)
                stats_executor = ThreadPoolExecutor(max_workers=1, thread_name_prefix="live-stats")
                stats_pending = None
                try:
                    while not stop_event or not stop_event.is_set():
                        if pending_frame is not None:
                            frame, pending_frame = pending_frame, None
                        else:
                            frame = source.read(timeout=0.1)
                        if frame is None:
                            if getattr(source, "is_running", False):
                                if perf_counter() - next_publish > getattr(self.settings, "live_no_frame_warning_seconds", 5.0):
                                    logger.warning("No live frame received for camera %s", self.camera.code)
                                time.sleep(0.01)
                                continue
                            break
                        capture_timestamp = getattr(source, "capture_timestamp", time.time())
                        timestamp = max(0.0, perf_counter() - started)
                        analysis.submit(frame, timestamp, capture_timestamp)
                        last_detections, events, last_face_matches = analysis.drain()
                        annotated = draw_detections(frame.copy(), last_detections, face_matches=last_face_matches)
                        evidence.record_frame(annotated, timestamp)
                        for event, event_frame, event_capture_timestamp in events:
                            self._store_alert(event, event_frame, evidence, event_capture_timestamp)
                        try:
                            if publisher.publish(annotated): published_frames += 1
                        except Exception:
                            logger.warning("Live publisher failed for camera %s", self.camera.code)
                        summary.frames_read += 1
                        while perf_counter() < next_publish:
                            time.sleep(0.001)
                        next_publish = max(next_publish + 1.0 / max(fps, 1), perf_counter())
                        now = perf_counter()
                        summary.frames_analyzed = analysis.analyzed
                        if now - last_metrics >= getattr(self.settings, "live_metrics_seconds", 10.0):
                            elapsed = now - metrics_started
                            logger.info("camera=%s analysis_fps=%.2f published_fps=%.2f dropped_frames=%d last_frame_to_alert_ms=%.1f", self.camera.code, summary.frames_analyzed / max(elapsed, 0.001), published_frames / max(elapsed, 0.001), getattr(source, "dropped_frames", 0), self.last_frame_to_alert_ms)
                            last_metrics = now
                        if now - stats_window[0] >= stats_interval and (stats_pending is None or stats_pending.done()):
                            window = max(now - stats_window[0], 0.001)
                            payload = self._stats_payload(source, last_detections, (summary.frames_analyzed - stats_window[1]) / window, (published_frames - stats_window[2]) / window, face_matches=last_face_matches)
                            stats_window = (now, summary.frames_analyzed, published_frames)
                            stats_pending = stats_executor.submit(self._publish_stats, payload)
                finally:
                    stats_executor.shutdown(wait=True)
                    analysis.close()
                    last_detections, events, last_face_matches = analysis.drain()
                    for event, event_frame, event_capture_timestamp in events:
                        self._store_alert(event, event_frame, evidence, event_capture_timestamp)
                    evidence.flush()
        summary.analysis_fps = summary.frames_analyzed / max(perf_counter() - started, 0.001)
        return summary

    def _stats_payload(self, source, detections, analysis_fps, published_fps, face_matches=None):
        labels = {}
        for detection in detections:
            labels[detection.label] = labels.get(detection.label, 0) + 1
        if face_matches:
            labels["face_match"] = len(face_matches)
        return {
            "camera_id": str(self.camera.id),
            "analysis_fps": round(analysis_fps, 2),
            "published_fps": round(published_fps, 2),
            "dropped_frames": int(getattr(source, "dropped_frames", 0)),
            "frame_to_alert_ms": None if self.last_alert_latency_ms is None else round(self.last_alert_latency_ms, 1),
            "people_tracked": labels.get("person", 0),
            "detections": labels,
            "updated_at": datetime.now(UTC).isoformat(),
        }

    def _publish_stats(self, payload):
        try:
            self.stats_publisher.publish(payload)
        except Exception:
            logger.warning("Publishing live stats failed for camera %s", self.camera.code, exc_info=True)

    def _wait_first_frame(self, source, stop_event):
        waited_since = perf_counter()
        last_warning = waited_since
        while not stop_event or not stop_event.is_set():
            frame = source.read(timeout=0.5)
            if frame is not None:
                return frame
            if not getattr(source, "is_running", False):
                return None
            now = perf_counter()
            if now - last_warning >= getattr(self.settings, "live_no_frame_warning_seconds", 5.0):
                logger.warning("Waiting for the first frame of camera %s (%.0f s)", self.camera.code, now - waited_since)
                last_warning = now
        return None

    def _store_alert(self, event, frame, evidence, capture_timestamp):
        self.last_frame_to_alert_ms = max(0.0, time.time() - capture_timestamp) * 1000
        self.last_alert_latency_ms = self.last_frame_to_alert_ms
        alert_id = uuid4()
        snapshot, clip = evidence.start_alert(event, alert_id, frame)
        prefix = f"alerts/live/{self.camera.code}"
        values = dict(id=alert_id, alert_type=event.alert_type, camera_id=self.camera.id, video_job_id=None, occurred_at=datetime.fromtimestamp(capture_timestamp, UTC), confidence=event.confidence, track_id=event.track_id, snapshot_path=f"{prefix}/{alert_id}.jpg" if snapshot else None, clip_path=f"{prefix}/{alert_id}.mp4" if clip else None, details={**event.details, "zone": event.zone, "bbox": list(event.bbox), "frame_index": event.frame_index, "timestamp_s": event.timestamp_s})
        session_context = self.session_factory()
        if session_context is None:
            self.alert_repository.create_alert(None, **values)
            return
        with session_context as session:
            self.alert_repository.create_alert(session, **values)
            session.commit()

    def _rules(self):
        rules = Path(self.settings.worker_rules_file)
        is_demo = self.camera.code.startswith(DEMO_CODE_PREFIX)
        zones = Path(getattr(self.settings, "demo_zones_file", "../config/zones/demo.json") if is_demo else self.settings.worker_zones_file)
        if rules.exists() and zones.exists():
            loaded = load_rules_config(rules, zones)
            return RulesEngine(loaded.zones, loaded.rules)
        logger.warning("Live zones file missing; running without zone rules")
        return RulesEngine(ZoneMap([]), RuleConfig())
