from pathlib import Path
from types import SimpleNamespace
from uuid import uuid4
from threading import Event

import os
import pytest
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker

from jobs.video_jobs import VideoJobRunner


class SessionContext:
    def __enter__(self):
        return self

    def __exit__(self, *args):
        return False

    def commit(self):
        pass


class FakeRepository:
    def __init__(self):
        self.job = SimpleNamespace(id=uuid4(), input_path="input.mp4", status="queued")
        self.claimed = False
        self.progress = []
        self.requeued = []
        self.completed = False
        self.failed = None

    def recover_processing(self, session):
        self.requeued.append("startup")

    def requeue_processing(self, session):
        self.requeued.append("startup")

    def claim_next(self, session):
        if self.claimed:
            return None
        self.claimed = True
        self.job.status = "processing"
        return self.job

    def update_progress(self, session, job_id, progress):
        self.progress.append(progress)

    def complete(self, session, job_id, output_path):
        self.completed = output_path

    def fail(self, session, job_id, message):
        self.failed = message

    def requeue(self, session, job_id):
        self.requeued.append(job_id)


class FakeSource:
    fps = 10
    frame_size = (10, 10)
    frame_count = 10

    def __enter__(self):
        return self

    def __exit__(self, *args):
        return False


class FakeWriter:
    def __init__(self, path):
        self.path = Path(path)

    def __enter__(self):
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self.path.write_bytes(b"partial")
        return self

    def __exit__(self, *args):
        return False


def settings(tmp_path):
    return SimpleNamespace(storage_dir=str(tmp_path), worker_models="", worker_stride=2)


def test_runner_completes_job_and_throttles_progress(tmp_path):
    repository = FakeRepository()

    def pipeline(source, writer, analyzers, stride, on_progress):
        for value in range(0, 101, 1):
            on_progress(value)
        return SimpleNamespace()

    runner = VideoJobRunner(
        session_factory=lambda: SessionContext(),
        settings=settings(tmp_path),
        repository=repository,
        pipeline=pipeline,
        source_factory=lambda path: FakeSource(),
        writer_factory=lambda path, fps, frame_size: FakeWriter(path),
    )

    assert runner.run_once() is True
    assert repository.completed.endswith(f"outputs/{repository.job.id}.mp4")
    assert repository.progress[-1] == 100
    assert len(repository.progress) <= 22


def test_runner_failure_records_short_error_and_removes_output(tmp_path):
    repository = FakeRepository()

    def pipeline(*args, **kwargs):
        raise RuntimeError("failure with a path /private/secret/input.mp4")

    runner = VideoJobRunner(
        session_factory=lambda: SessionContext(),
        settings=settings(tmp_path),
        repository=repository,
        pipeline=pipeline,
        source_factory=lambda path: FakeSource(),
        writer_factory=lambda path, fps, frame_size: FakeWriter(path),
    )

    runner.run_once()
    assert repository.failed == "failure with a path input.mp4"
    assert len(repository.failed) <= 500
    assert not list((tmp_path / "outputs").glob("*"))


def test_runner_stop_requeues_job_and_removes_partial_output(tmp_path):
    repository = FakeRepository()
    stop_event = Event()

    def pipeline(source, writer, analyzers, stride, on_progress):
        stop_event.set()
        on_progress(10)

    runner = VideoJobRunner(
        session_factory=lambda: SessionContext(),
        settings=settings(tmp_path),
        repository=repository,
        pipeline=pipeline,
        source_factory=lambda path: FakeSource(),
        writer_factory=lambda path, fps, frame_size: FakeWriter(path),
    )

    runner.run_once(stop_event)

    assert repository.requeued[-1] == repository.job.id
    assert not list((tmp_path / "outputs").glob("*"))


def test_runner_requeues_processing_jobs_on_startup(tmp_path):
    repository = FakeRepository()
    runner = VideoJobRunner(session_factory=lambda: SessionContext(), settings=settings(tmp_path), repository=repository)

    runner.recover_processing()

    assert repository.requeued == ["startup"]


@pytest.mark.integration
def test_concurrent_claims_skip_locked_job():
    database_url = os.getenv("TEST_DATABASE_URL")
    if not database_url:
        pytest.skip("TEST_DATABASE_URL is not set")
    from app.modules.videos.repository import VideoRepository

    engine = create_engine(database_url)
    session_factory = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)
    user_id = None
    job_id = None
    with engine.connect() as setup:
        try:
            role_id = setup.execute(text("SELECT id FROM roles WHERE code = 'guard'")).scalar_one()
            user_id = setup.execute(
                text("""INSERT INTO users (username, email, full_name, password_hash, role_id)
                       VALUES ('claim_test', 'claim_test@example.com', 'Claim Test', 'test', :role_id)
                       RETURNING id"""),
                {"role_id": role_id},
            ).scalar_one()
            job_id = setup.execute(
                text("""INSERT INTO video_jobs (uploaded_by, original_filename, input_path)
                       VALUES (:user_id, 'claim.mp4', '/tmp/claim.mp4') RETURNING id"""),
                {"user_id": user_id},
            ).scalar_one()
            setup.commit()
            first = session_factory()
            second = session_factory()
            try:
                first_job = VideoRepository().claim_next(first)
                second_job = VideoRepository().claim_next(second)
                assert first_job is not None and first_job.id == job_id
                assert second_job is None
            finally:
                first.rollback()
                second.rollback()
                first.close()
                second.close()
        finally:
            with engine.begin() as cleanup:
                if job_id is not None:
                    cleanup.execute(text("DELETE FROM video_jobs WHERE id = :job_id"), {"job_id": job_id})
                if user_id is not None:
                    cleanup.execute(text("DELETE FROM users WHERE id = :user_id"), {"user_id": user_id})
