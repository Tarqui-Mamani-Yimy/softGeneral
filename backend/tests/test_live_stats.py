import json
import os
import threading
from datetime import datetime
from pathlib import Path
from types import SimpleNamespace
from uuid import uuid4

import numpy as np
import pytest

from live.runner import LiveCameraRunner
from tests.test_live import Analyzer, Publisher, Repo, Source
from vision.detection.types import DetectionResult
from vision.rules.config import RuleConfig
from vision.rules.engine import RulesEngine
from vision.rules.zones import ZoneMap

REPO_ROOT = Path(__file__).resolve().parents[2]
RULES = str(REPO_ROOT / "config" / "rules.yaml")
EXAMPLE_ZONES = str(REPO_ROOT / "config" / "zones" / "example.json")
DEMO_ZONES = str(REPO_ROOT / "config" / "zones" / "demo.json")


def make_settings(tmp_path, **extra):
    values = dict(storage_dir=str(tmp_path), worker_models="person", live_analysis_stride=1, live_metrics_seconds=60,
                  worker_clip_before_seconds=0, worker_clip_after_seconds=0, worker_rules_file=RULES,
                  worker_zones_file=EXAMPLE_ZONES, demo_zones_file=DEMO_ZONES)
    values.update(extra)
    return SimpleNamespace(**values)


class LongSource(Source):
    def __init__(self, count=20):
        self.frames = iter([np.zeros((100, 100, 3), dtype=np.uint8) for _ in range(count)])
        self.dropped_frames = 3
    fps = 20


class CountingPublisher(Publisher):
    def publish(self, frame):
        self.frames += 1
        return True


class FakeStats:
    def __init__(self, fail=False):
        self.payloads = []
        self.fail = fail
    def publish(self, payload):
        self.payloads.append(payload)
        if self.fail:
            raise RuntimeError("stats down")


def zone_names(runner):
    return {zone.name for zone in runner._rules().zones.zones}


def test_demo_camera_uses_demo_zones_and_regular_camera_keeps_worker_zones(tmp_path):
    settings = make_settings(tmp_path)
    demo = LiveCameraRunner(SimpleNamespace(id=uuid4(), code="demo_abcd", source_url="x", source_type="webcam"), settings, session_factory=lambda: None)
    regular = LiveCameraRunner(SimpleNamespace(id=uuid4(), code="cam-1", source_url="x", source_type="rtsp"), settings, session_factory=lambda: None)

    assert zone_names(demo) == {"demo_stands_left", "demo_field", "demo_stands_right"}
    assert "authorized_tunnel" in zone_names(regular)


def test_demo_zones_raise_one_intrusion_when_a_person_enters_from_the_stands(tmp_path):
    repo = Repo()
    camera = SimpleNamespace(id=uuid4(), code="demo_abcd", source_url="x", source_type="webcam")
    # Analyzer: first person in the left stands (x 0.1), then at the field (x 0.5, y 0.6).
    runner = LiveCameraRunner(camera, make_settings(tmp_path), session_factory=lambda: None, alert_repository=repo, source_factory=lambda *_: LongSource(30), publisher_factory=lambda *a: Publisher(), analyzer_factory=lambda: [Analyzer()], stats_publisher=FakeStats())

    runner.run()

    assert [alert["alert_type"] for alert in repo.alerts] == ["intrusion"]
    assert repo.alerts[0]["details"]["zone"] == "demo_field"


class StatsAnalyzer:
    def analyze(self, frame):
        return [DetectionResult("person", 0.9, (5, 20, 15, 70), 1), DetectionResult("person", 0.9, (30, 20, 40, 70), 2), DetectionResult("weapon", 0.8, (50, 50, 60, 60), None)]


def test_runner_publishes_windowed_stats_at_the_configured_interval(tmp_path):
    stats = FakeStats()
    camera = SimpleNamespace(id=uuid4(), code="cam-1", source_url="x", source_type="rtsp")
    settings = make_settings(tmp_path, live_stats_seconds=0.1)
    runner = LiveCameraRunner(camera, settings, session_factory=lambda: None, alert_repository=Repo(), source_factory=lambda *_: LongSource(40), publisher_factory=lambda *a: CountingPublisher(), analyzer_factory=lambda: [StatsAnalyzer()], rules_factory=lambda: RulesEngine(ZoneMap([]), RuleConfig()), stats_publisher=stats)

    runner.run()

    assert len(stats.payloads) >= 3
    first = stats.payloads[0]
    assert set(first) == {"camera_id", "analysis_fps", "published_fps", "dropped_frames", "frame_to_alert_ms", "people_tracked", "detections", "updated_at"}
    assert first["camera_id"] == str(camera.id)
    assert first["dropped_frames"] == 3
    assert first["frame_to_alert_ms"] is None
    datetime.fromisoformat(first["updated_at"])
    latest = stats.payloads[-1]
    assert latest["people_tracked"] == 2
    assert latest["detections"] == {"person": 2, "weapon": 1}
    # Rates cover the last window (20 fps source), not the time since start.
    for payload in stats.payloads[1:]:
        assert 5 < payload["published_fps"] < 40
        assert payload["analysis_fps"] > 0
    assert len(json.dumps(first)) < 8000


def test_stats_publisher_failure_does_not_stop_the_runner(tmp_path):
    stats = FakeStats(fail=True)
    camera = SimpleNamespace(id=uuid4(), code="cam-1", source_url="x", source_type="rtsp")
    settings = make_settings(tmp_path, live_stats_seconds=0.05)
    runner = LiveCameraRunner(camera, settings, session_factory=lambda: None, alert_repository=Repo(), source_factory=lambda *_: LongSource(20), publisher_factory=lambda *a: Publisher(), analyzer_factory=lambda: [], rules_factory=lambda: RulesEngine(ZoneMap([]), RuleConfig()), stats_publisher=stats)

    summary = runner.run()

    assert summary.frames_read == 20
    assert len(stats.payloads) >= 2


def test_db_stats_publisher_sends_pg_notify_with_bound_parameters():
    from live.stats import DbStatsPublisher

    executed = []

    class Session:
        def __enter__(self): return self
        def __exit__(self, *args): return False
        def execute(self, statement, params):
            executed.append((str(statement), params))
        def commit(self): executed.append(("commit", None))

    DbStatsPublisher(lambda: Session()).publish({"camera_id": "c", "analysis_fps": 1.0})

    assert "pg_notify('camera_metrics', :payload)" in executed[0][0]
    assert json.loads(executed[0][1]["payload"]) == {"camera_id": "c", "analysis_fps": 1.0}
    assert executed[-1][0] == "commit"


@pytest.mark.integration
def test_stats_notify_reaches_a_listening_connection():
    url = os.getenv("TEST_DATABASE_URL")
    if not url:
        pytest.skip("TEST_DATABASE_URL is not set")
    import psycopg
    from sqlalchemy import create_engine
    from sqlalchemy.orm import sessionmaker
    from live.stats import DbStatsPublisher

    engine = create_engine(url)
    listener = psycopg.connect(url.replace("postgresql+psycopg://", "postgresql://"), autocommit=True)
    try:
        listener.execute("LISTEN camera_metrics")
        payload = {"camera_id": str(uuid4()), "analysis_fps": 1.5}
        DbStatsPublisher(sessionmaker(bind=engine)).publish(payload)
        # Other processes (e.g. a running live worker) may publish on the same
        # channel; wait for the notification that carries this test's camera id.
        received = None
        for notify in listener.notifies(timeout=5):
            if json.loads(notify.payload).get("camera_id") == payload["camera_id"]:
                received = notify
                break
    finally:
        listener.close()
        engine.dispose()
    assert received is not None
    assert received.channel == "camera_metrics"
    assert json.loads(received.payload) == payload


def test_analysis_stride_one_analyzes_frames(tmp_path):
    camera = SimpleNamespace(id=uuid4(), code="cam-1", source_url="x", source_type="rtsp")
    runner = LiveCameraRunner(camera, make_settings(tmp_path, live_analysis_stride=1), session_factory=lambda: None, alert_repository=Repo(), source_factory=lambda *_: LongSource(10), publisher_factory=lambda *a: Publisher(), analyzer_factory=lambda: [StatsAnalyzer()], rules_factory=lambda: RulesEngine(ZoneMap([]), RuleConfig()), stats_publisher=FakeStats())

    assert runner.run().frames_analyzed > 0
