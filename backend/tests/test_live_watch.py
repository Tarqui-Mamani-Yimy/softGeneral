import threading
from contextlib import contextmanager
from datetime import UTC, datetime, timedelta
from types import SimpleNamespace
from uuid import uuid4

from live.supervisor import LiveSupervisor, WatchedCamera


def cam(code, created_minutes_ago=0, source_type="rtsp", source_url="rtsp://x/y"):
    return WatchedCamera(
        id=uuid4(),
        code=code,
        source_type=source_type,
        source_url=source_url,
        created_at=datetime.now(UTC) - timedelta(minutes=created_minutes_ago),
    )


class FakeWatchRepository:
    def __init__(self):
        self.active: list[WatchedCamera] = []
        self.audit: list[dict] = []

    def list_watchable(self, session):
        return [c for c in self.active if c.source_type in {"rtsp", "webcam"}]

    def expire_demo(self, session, camera_id):
        self.active = [c for c in self.active if c.id != camera_id]
        self.audit.append({"user_id": None, "action": "camera.disabled", "entity_id": str(camera_id), "details": {"reason": "demo_expired"}})


@contextmanager
def fake_session():
    yield object()


class FakeRunners:
    """Runner factory: every runner blocks until its stop event is set or it is crashed."""

    def __init__(self):
        self.started: list[str] = []
        self.crash = {}
        self.stop_events: dict[str, threading.Event] = {}

    def __call__(self, camera, stop_event):
        self.started.append(camera.code)
        self.stop_events[camera.code] = stop_event
        crash = threading.Event()
        self.crash[camera.code] = crash

        def run():
            while not stop_event.is_set() and not crash.is_set():
                stop_event.wait(0.01)

        return run


def make_supervisor(repo, runners, expire_minutes=10):
    clock = SimpleNamespace(now=0.0)
    supervisor = LiveSupervisor(
        repository=repo,
        session_factory=fake_session,
        runner_factory=runners,
        demo_max_minutes=expire_minutes,
        monotonic=lambda: clock.now,
        join_timeout=2.0,
    )
    return supervisor, clock


def wait_dead(supervisor, code):
    supervisor.runners[code].thread.join(timeout=2)


def test_starts_runner_once_per_new_camera():
    repo, runners = FakeWatchRepository(), FakeRunners()
    repo.active = [cam("cam_a"), cam("cam_b", source_type="webcam", source_url="0")]
    supervisor, _ = make_supervisor(repo, runners)
    supervisor.poll()
    supervisor.poll()
    assert sorted(runners.started) == ["cam_a", "cam_b"]
    supervisor.stop()


def test_stops_runner_when_camera_is_disabled():
    repo, runners = FakeWatchRepository(), FakeRunners()
    camera = cam("cam_a")
    repo.active = [camera]
    supervisor, _ = make_supervisor(repo, runners)
    supervisor.poll()
    thread = supervisor.runners["cam_a"].thread
    repo.active = []
    supervisor.poll()
    assert runners.stop_events["cam_a"].is_set()
    assert not thread.is_alive()
    assert "cam_a" not in supervisor.runners


def test_restarts_dead_runner_with_backoff():
    repo, runners = FakeWatchRepository(), FakeRunners()
    repo.active = [cam("cam_a")]
    supervisor, clock = make_supervisor(repo, runners)
    supervisor.poll()
    runners.crash["cam_a"].set()
    wait_dead(supervisor, "cam_a")
    supervisor.poll()  # death detected, restart scheduled after the backoff
    assert runners.started == ["cam_a"]
    clock.now += 100
    supervisor.poll()
    assert runners.started == ["cam_a", "cam_a"]
    assert supervisor.runners["cam_a"].thread.is_alive()
    supervisor.stop()


def test_expires_old_demo_cameras_and_stops_their_runner():
    repo, runners = FakeWatchRepository(), FakeRunners()
    old_demo = cam("demo_deadbeef", created_minutes_ago=11)
    fresh_demo = cam("demo_cafebabe", created_minutes_ago=1)
    regular = cam("cam_old", created_minutes_ago=600)
    repo.active = [old_demo, fresh_demo, regular]
    supervisor, _ = make_supervisor(repo, runners)
    supervisor.poll()
    assert "demo_deadbeef" not in runners.started
    assert sorted(runners.started) == ["cam_old", "demo_cafebabe"]
    assert repo.audit == [
        {"user_id": None, "action": "camera.disabled", "entity_id": str(old_demo.id), "details": {"reason": "demo_expired"}}
    ]
    supervisor.stop()


def test_running_demo_runner_is_stopped_when_it_expires():
    repo, runners = FakeWatchRepository(), FakeRunners()
    demo = cam("demo_deadbeef", created_minutes_ago=9)
    repo.active = [demo]
    supervisor, _ = make_supervisor(repo, runners)
    supervisor.poll()
    assert "demo_deadbeef" in supervisor.runners
    repo.active[0] = WatchedCamera(demo.id, demo.code, demo.source_type, demo.source_url, datetime.now(UTC) - timedelta(minutes=11))
    supervisor.poll()
    assert "demo_deadbeef" not in supervisor.runners
    assert runners.stop_events["demo_deadbeef"].is_set()
    assert len(repo.audit) == 1


def test_stop_joins_all_threads():
    repo, runners = FakeWatchRepository(), FakeRunners()
    repo.active = [cam("cam_a"), cam("cam_b")]
    supervisor, _ = make_supervisor(repo, runners)
    supervisor.poll()
    threads = [r.thread for r in supervisor.runners.values()]
    assert all(t.is_alive() for t in threads)
    supervisor.stop()
    assert not any(t.is_alive() for t in threads)
    assert supervisor.runners == {}


def test_poll_survives_database_errors():
    repo, runners = FakeWatchRepository(), FakeRunners()
    repo.active = [cam("cam_a")]
    supervisor, _ = make_supervisor(repo, runners)
    supervisor.poll()

    def boom(session):
        raise RuntimeError("db down")

    repo.list_watchable = boom
    supervisor.poll()  # must not raise nor stop running runners
    assert "cam_a" in supervisor.runners
    supervisor.stop()


def test_run_forever_polls_until_stop_event():
    repo, runners = FakeWatchRepository(), FakeRunners()
    repo.active = [cam("cam_a")]
    supervisor, _ = make_supervisor(repo, runners)
    stop = threading.Event()
    worker = threading.Thread(target=supervisor.run_forever, args=(stop, 0.01))
    worker.start()
    for _ in range(200):
        if runners.started:
            break
        stop.wait(0.01)
    stop.set()
    worker.join(timeout=3)
    assert not worker.is_alive()
    assert runners.started == ["cam_a"]
    assert supervisor.runners == {}
