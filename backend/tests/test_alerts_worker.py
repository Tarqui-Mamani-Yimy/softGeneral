from pathlib import Path
from types import SimpleNamespace
from uuid import uuid4

import numpy as np
import os
import pytest
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker

from jobs.video_jobs import VideoJobRunner
from vision.detection.types import DetectionResult
from vision.rules.engine import AlertEvent


class Session:
    def __enter__(self): return self
    def __exit__(self, *args): return False
    def commit(self): pass
    def rollback(self): pass


class AlertRepo:
    def __init__(self):
        self.job = SimpleNamespace(id=uuid4(), input_path="input.mp4", status="queued", started_at=None)
        self.claimed = False
        self.alerts = []
        self.requeued = False
        self.completed = False

    def claim_next(self, session):
        if self.claimed: return None
        self.claimed = True
        self.job.status = "processing"
        return self.job

    def requeue_processing(self, session): pass
    def update_progress(self, session, job_id, progress): pass
    def complete(self, session, job_id, output_path): self.completed = True
    def fail(self, session, job_id, message): raise AssertionError(message)
    def requeue(self, session, job_id): self.requeued = True
    def create_alert(self, session, **kwargs): self.alerts.append(kwargs); return uuid4()
    def delete_for_video_job(self, session, job_id): self.alerts.clear()


class Source:
    fps = 5
    frame_size = (10, 10)
    frame_count = 1
    def __enter__(self): return self
    def __exit__(self, *args): return False


class Writer:
    def __init__(self, path): self.path = Path(path)
    def __enter__(self): self.path.parent.mkdir(parents=True, exist_ok=True); return self
    def __exit__(self, *args): return False


def settings(tmp_path):
    return SimpleNamespace(storage_dir=str(tmp_path), worker_models="", worker_stride=1, worker_rules_file="missing", worker_zones_file="missing", worker_clip_before_seconds=1, worker_clip_after_seconds=1)


def test_worker_stores_relative_alert_paths(tmp_path):
    repo = AlertRepo()
    def pipeline(source, writer, analyzers, stride, on_progress, **kwargs):
        kwargs["on_alert"](AlertEvent("weapon", 0, 0.0, 0.8, (1, 1, 5, 5), 2, None, {}), np.zeros((10, 10, 3), dtype=np.uint8))
        on_progress(100)
    runner = VideoJobRunner(lambda: Session(), settings(tmp_path), repository=repo, alert_repository=repo, pipeline=pipeline, source_factory=lambda _: Source(), writer_factory=lambda p, f, s: Writer(p))

    runner.run_once()

    assert repo.completed
    assert repo.alerts and not repo.alerts[0]["snapshot_path"].startswith("/")
    assert not repo.alerts[0]["clip_path"].startswith("/")


def test_stop_removes_alert_rows_and_files(tmp_path):
    repo = AlertRepo()
    stop_event = __import__("threading").Event()

    def pipeline(source, writer, analyzers, stride, on_progress, **kwargs):
        frame = np.zeros((10, 10, 3), dtype=np.uint8)
        kwargs["on_alert"](AlertEvent("weapon", 0, 0.0, 0.8, (1, 1, 5, 5), 2, None, {}), frame)
        stop_event.set()
        on_progress(10)

    runner = VideoJobRunner(lambda: Session(), settings(tmp_path), repository=repo, alert_repository=repo, pipeline=pipeline, source_factory=lambda _: Source(), writer_factory=lambda p, f, s: Writer(p))
    runner.run_once(stop_event)

    assert repo.requeued
    assert repo.alerts == []
    assert not list((tmp_path / "alerts").rglob("*.jpg"))
    assert not list((tmp_path / "alerts").rglob("*.mp4"))


def test_evidence_failure_still_persists_alert(tmp_path):
    repo = AlertRepo()

    class BrokenEvidence:
        def start_alert(self, *args): return None, None
        def cleanup(self): pass
        def record_frame(self, *args): pass
        def flush(self): pass

    def pipeline(source, writer, analyzers, stride, on_progress, **kwargs):
        kwargs["on_alert"](AlertEvent("weapon", 0, 0.0, 0.8, (1, 1, 5, 5), 2, None, {}), np.zeros((10, 10, 3), dtype=np.uint8))
        on_progress(100)

    runner = VideoJobRunner(lambda: Session(), settings(tmp_path), repository=repo, alert_repository=repo, pipeline=pipeline, evidence_factory=lambda *args: BrokenEvidence(), source_factory=lambda _: Source(), writer_factory=lambda p, f, s: Writer(p))
    runner.run_once()

    assert len(repo.alerts) == 1
    assert repo.alerts[0]["snapshot_path"] is None
    assert repo.alerts[0]["clip_path"] is None


class JobOnlyRepo(AlertRepo):
    """Like the real VideoRepository: it has no alert methods."""

    create_alert = None
    delete_for_video_job = None


class AlertsOnlyRepo:
    def __init__(self):
        self.alerts = []

    def create_alert(self, session, **kwargs): self.alerts.append(kwargs); return uuid4()
    def delete_for_video_job(self, session, job_id): self.alerts.clear()


def test_default_repositories_are_the_real_video_and_alert_repositories(tmp_path):
    from app.modules.alerts.repository import AlertRepository
    from app.modules.videos.repository import VideoRepository

    runner = VideoJobRunner(lambda: Session(), settings(tmp_path), pipeline=lambda *a, **k: None)

    assert isinstance(runner.repository, VideoRepository)
    assert isinstance(runner.alert_repository, AlertRepository)


def test_alerts_go_to_the_alert_repository_and_are_removed_on_stop(tmp_path):
    jobs, alerts = JobOnlyRepo(), AlertsOnlyRepo()
    stop_event = __import__("threading").Event()

    def pipeline(source, writer, analyzers, stride, on_progress, **kwargs):
        kwargs["on_alert"](AlertEvent("weapon", 0, 0.0, 0.8, (1, 1, 5, 5), 2, None, {}), np.zeros((10, 10, 3), dtype=np.uint8))
        assert len(alerts.alerts) == 1
        stop_event.set()
        on_progress(10)

    runner = VideoJobRunner(lambda: Session(), settings(tmp_path), repository=jobs, alert_repository=alerts, pipeline=pipeline, source_factory=lambda _: Source(), writer_factory=lambda p, f, s: Writer(p))
    runner.run_once(stop_event)

    assert jobs.requeued
    assert alerts.alerts == []


@pytest.mark.integration
def test_alert_insert_satisfies_database_constraints_and_rolls_back():
    database_url = os.getenv("TEST_DATABASE_URL")
    if not database_url:
        pytest.skip("TEST_DATABASE_URL is not set")
    from app.modules.alerts.repository import AlertRepository

    engine = create_engine(database_url)
    factory = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)
    with engine.connect() as connection:
        transaction = connection.begin()
        try:
            role_id = connection.execute(text("SELECT id FROM roles WHERE code = 'guard'")).scalar_one()
            user_id = connection.execute(text("""INSERT INTO users (username, email, full_name, password_hash, role_id)
                VALUES ('alert_constraint_test', 'alert_constraint_test@example.com', 'Alert Test', 'test', :role_id) RETURNING id"""), {"role_id": role_id}).scalar_one()
            job_id = connection.execute(text("INSERT INTO video_jobs (uploaded_by, original_filename, input_path) VALUES (:user_id, 'a.mp4', 'a.mp4') RETURNING id"), {"user_id": user_id}).scalar_one()
            connection.begin_nested()
            session = sessionmaker(bind=connection, autoflush=False, expire_on_commit=False)()
            AlertRepository().create_alert(session, id=uuid4(), alert_type="intrusion", video_job_id=job_id, occurred_at=__import__("datetime").datetime.now(__import__("datetime").UTC), confidence=0.9, track_id=1, snapshot_path="alerts/a.jpg", clip_path="alerts/a.mp4", details={"frame_index": 1})
            session.close()
        finally:
            transaction.rollback()
