from datetime import datetime, timezone
from pathlib import Path
from types import SimpleNamespace
from uuid import uuid4

import numpy as np

from live.runner import LiveCameraRunner
from vision.detection.types import DetectionResult
from vision.rules.config import RuleConfig
from vision.rules.engine import RulesEngine
from vision.rules.zones import Zone, ZoneMap


@__import__("pytest").mark.integration
def test_live_alert_database_constraint_rolls_back():
    import os
    if not os.getenv("TEST_DATABASE_URL"):
        __import__("pytest").skip("TEST_DATABASE_URL is not set")
    from sqlalchemy import create_engine, text
    from sqlalchemy.orm import sessionmaker
    from live.repository import LiveAlertRepository
    engine = create_engine(os.environ["TEST_DATABASE_URL"])
    with engine.connect() as connection:
        transaction = connection.begin()
        try:
            role_id = connection.execute(text("SELECT id FROM roles WHERE code = 'guard'")).scalar_one()
            user_id = connection.execute(text("""INSERT INTO users (username, email, full_name, password_hash, role_id)
                VALUES ('live_constraint_user', 'live_constraint@example.com', 'Live Test', 'hash', :role_id) RETURNING id"""), {"role_id": role_id}).scalar_one()
            camera_id = connection.execute(text("""INSERT INTO cameras (code, name, source_type, source_url)
                VALUES ('live_constraint_camera', 'Live Test', 'rtsp', 'rtsp://test') RETURNING id""")).scalar_one()
            session = sessionmaker(bind=connection, autoflush=False, expire_on_commit=False)()
            LiveAlertRepository().create_alert(session, id=uuid4(), alert_type="intrusion", camera_id=camera_id, occurred_at=datetime.now(timezone.utc), confidence=0.9, track_id=1, snapshot_path=None, clip_path=None, details={})
            session.close()
        finally:
            transaction.rollback()


class Source:
    fps = 10
    frame_size = (100, 100)
    dropped_frames = 0
    capture_timestamp = datetime.now(timezone.utc).timestamp()
    def __init__(self): self.frames = iter([np.zeros((100, 100, 3), dtype=np.uint8) for _ in range(6)])
    def __enter__(self): return self
    def __exit__(self, *args): pass
    def read(self, timeout=0.1):
        try: return next(self.frames)
        except StopIteration: return None
    def close(self): pass


class TimeoutSource(Source):
    is_running = True
    def __init__(self): self.calls = 0
    def read(self, timeout=0.1):
        self.calls += 1
        if self.calls < 3: return None
        if self.calls > 4:
            self.is_running = False
            return None
        return np.zeros((100, 100, 3), dtype=np.uint8)


class Publisher:
    def __init__(self): self.frames = 0
    def __enter__(self): return self
    def __exit__(self, *args): pass
    def publish(self, frame): self.frames += 1


class Repo:
    def __init__(self): self.alerts = []
    def create_alert(self, session, **values): self.alerts.append(values); return uuid4()


class Analyzer:
    def __init__(self): self.index = 0
    def analyze(self, frame):
        box = (5, 20, 15, 70) if self.index < 1 else (40, 20, 60, 60)
        self.index += 1
        return [DetectionResult("person", 0.9, box, 1)]


class SlowAnalyzer(Analyzer):
    def analyze(self, frame):
        import time
        time.sleep(0.5)
        return super().analyze(frame)


def test_live_runner_publishes_every_frame_analyzes_stride_and_stores_camera_alert(tmp_path):
    zones = ZoneMap([
        Zone("field", "field", ((0.2, 0.2), (0.8, 0.2), (0.8, 0.8), (0.2, 0.8))),
        Zone("stands", "stands", ((0, 0), (0.2, 0), (0.2, 1), (0, 1))),
    ])
    repo = Repo()
    publisher = Publisher()
    camera = SimpleNamespace(id=uuid4(), code="cam-test", source_url="fake", source_type="rtsp")
    settings = SimpleNamespace(storage_dir=str(tmp_path), worker_models="person", worker_stride=2, live_analysis_stride=2, live_metrics_seconds=60, worker_clip_before_seconds=0, worker_clip_after_seconds=0)
    runner = LiveCameraRunner(camera, settings, session_factory=lambda: None, alert_repository=repo, source_factory=lambda *_: Source(), publisher_factory=lambda *args: publisher, analyzer_factory=lambda: [Analyzer()], rules_factory=lambda: RulesEngine(zones, RuleConfig(intrusion_min_frames=2, fire_smoke_k=6, fire_smoke_n=10, weapon_k=3, weapon_n=5)))

    summary = runner.run()

    assert summary.frames_read == 6
    assert summary.frames_analyzed == 3
    assert publisher.frames == 6
    assert len(repo.alerts) == 1
    assert repo.alerts[0]["camera_id"] == camera.id
    assert repo.alerts[0]["video_job_id"] is None


def test_live_publisher_failure_does_not_stop_analysis(tmp_path):
    class BrokenPublisher(Publisher):
        def publish(self, frame):
            self.frames += 1
            raise RuntimeError("publisher down")
    camera = SimpleNamespace(id=uuid4(), code="cam-test", source_url="fake", source_type="rtsp")
    settings = SimpleNamespace(storage_dir=str(tmp_path), worker_models="", worker_stride=2, live_analysis_stride=2, live_metrics_seconds=60, worker_clip_before_seconds=0, worker_clip_after_seconds=0)
    publisher = BrokenPublisher()
    runner = LiveCameraRunner(camera, settings, session_factory=lambda: None, alert_repository=Repo(), source_factory=lambda *_: Source(), publisher_factory=lambda *args: publisher, analyzer_factory=lambda: [], rules_factory=lambda: RulesEngine(ZoneMap([])))

    summary = runner.run()

    assert summary.frames_read == 6


def test_live_runner_keeps_waiting_through_read_timeouts(tmp_path):
    camera = SimpleNamespace(id=uuid4(), code="cam-timeout", source_url="fake", source_type="rtsp")
    settings = SimpleNamespace(storage_dir=str(tmp_path), worker_models="", worker_stride=1, live_analysis_stride=1, live_metrics_seconds=60, live_no_frame_warning_seconds=60, worker_clip_before_seconds=0, worker_clip_after_seconds=0)
    source = TimeoutSource()
    runner = LiveCameraRunner(camera, settings, session_factory=lambda: None, alert_repository=Repo(), source_factory=lambda *_: source, publisher_factory=lambda *args: Publisher(), analyzer_factory=lambda: [], rules_factory=lambda: RulesEngine(ZoneMap([])))

    summary = runner.run()

    assert source.calls >= 3
    assert summary.frames_read >= 1


def test_slow_analysis_does_not_throttle_publish_loop(tmp_path):
    camera = SimpleNamespace(id=uuid4(), code="cam-slow", source_url="fake", source_type="rtsp")
    settings = SimpleNamespace(storage_dir=str(tmp_path), worker_models="", worker_stride=1, live_analysis_stride=1, live_metrics_seconds=60, worker_clip_before_seconds=0, worker_clip_after_seconds=0)
    source = Source()
    source.frames = iter([np.zeros((100, 100, 3), dtype=np.uint8) for _ in range(20)])
    publisher = Publisher()
    runner = LiveCameraRunner(camera, settings, session_factory=lambda: None, alert_repository=Repo(), source_factory=lambda *_: source, publisher_factory=lambda *args: publisher, analyzer_factory=lambda: [SlowAnalyzer()], rules_factory=lambda: RulesEngine(ZoneMap([])))

    summary = runner.run()

    assert publisher.frames >= 15
    assert summary.frames_analyzed < summary.frames_read


def test_publisher_restarts_with_backoff_and_logs_stderr(tmp_path, caplog):
    from live.publisher import RTSPPublisher
    script = tmp_path / "ffmpeg-fails"
    count = tmp_path / "count"
    script.write_text(f"#!/bin/sh\necho x >> '{count}'\necho failed >&2\nexit 1\n")
    script.chmod(0o755)
    publisher = RTSPPublisher("rtsp://127.0.0.1:8554", "cam", 10, (10, 10), ffmpeg_binary=str(script))
    publisher.retry_initial = 1.0
    with publisher:
        publisher.publish(np.zeros((10, 10, 3), dtype=np.uint8))
        import time
        time.sleep(0.05)
        assert publisher.publish(np.zeros((10, 10, 3), dtype=np.uint8)) is False
    assert count.read_text().count("x") == 1
    assert "failed" in caplog.text


def test_publisher_pushes_rtsp_over_tcp(monkeypatch):
    """MediaMTX in Docker only exposes RTSP over TCP; ffmpeg's default UDP
    transport never delivers media and MediaMTX drops the session after 10 s."""
    import subprocess

    from live.publisher import RTSPPublisher

    captured = {}

    class FakeProcess:
        stdin = stderr = None
        def poll(self): return None

    def fake_popen(command, **kwargs):
        captured["command"] = command
        return FakeProcess()

    monkeypatch.setattr(subprocess, "Popen", fake_popen)
    publisher = RTSPPublisher("rtsp://127.0.0.1:8554", "cam", 10.0, (8, 6))
    publisher._start()

    command = captured["command"]
    assert command[command.index("-rtsp_transport") + 1] == "tcp"
    assert command.index("-rtsp_transport") < command.index("-f", command.index("-i"))


def test_publisher_and_evidence_use_the_first_real_frame_size(tmp_path):
    """A camera can report 0x0 until its first keyframe; the runner must size the
    publisher from the first decoded frame, never from that metadata."""

    class LateSizeSource(Source):
        frame_size = (0, 0)
        is_running = True
        def __init__(self):
            self.calls = 0
        def read(self, timeout=0.1):
            self.calls += 1
            if self.calls <= 3:
                return None  # waiting for the first keyframe
            if self.calls > 6:
                self.is_running = False
                return None
            return np.zeros((60, 80, 3), dtype=np.uint8)

    sizes = {}

    def publisher_factory(code, fps, size):
        sizes["publisher"] = size
        return Publisher()

    def evidence_factory(root, code, fps, size, before, after):
        sizes["evidence"] = size
        from vision.evidence.recorder import EvidenceRecorder
        return EvidenceRecorder(root, code, fps, size, before, after)

    camera = SimpleNamespace(id=uuid4(), code="cam-late", source_url="fake", source_type="rtsp")
    settings = SimpleNamespace(storage_dir=str(tmp_path), worker_models="person", live_analysis_stride=2, live_metrics_seconds=60, worker_clip_before_seconds=0, worker_clip_after_seconds=0)
    runner = LiveCameraRunner(camera, settings, session_factory=lambda: None, alert_repository=Repo(), source_factory=lambda *_: LateSizeSource(), publisher_factory=publisher_factory, analyzer_factory=lambda: [], rules_factory=lambda: RulesEngine(ZoneMap([]), RuleConfig()), evidence_factory=evidence_factory)

    summary = runner.run()

    assert sizes == {"publisher": (80, 60), "evidence": (80, 60)}
    assert summary.frames_read == 3


def test_publisher_encodes_vp8_so_every_webrtc_browser_can_play_it(monkeypatch):
    """VP8 is mandatory in WebRTC for every browser. H.264 depends on the browser
    (Firefox on Linux needs the OpenH264 plugin and often offers only VP8, which made
    MediaMTX close the viewer with "codecs not supported by client")."""
    import subprocess

    from live.publisher import RTSPPublisher

    captured = {}

    class FakeProcess:
        stdin = stderr = None
        def poll(self): return None

    monkeypatch.setattr(subprocess, "Popen", lambda command, **kwargs: captured.setdefault("command", command) and FakeProcess())
    RTSPPublisher("rtsp://127.0.0.1:8554", "cam", 10.0, (8, 6))._start()

    command = captured["command"]
    assert command[command.index("-c:v") + 1] == "libvpx"
    assert command[command.index("-deadline") + 1] == "realtime"
    # keyframe every 2 s so a viewer that joins late sees the picture quickly
    assert command[command.index("-g") + 1] == "20"
