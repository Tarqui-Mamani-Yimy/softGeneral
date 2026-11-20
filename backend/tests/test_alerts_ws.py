from datetime import UTC, datetime, timedelta, timezone
from pathlib import Path
from uuid import UUID, uuid4

import jwt
import pytest
from fastapi.testclient import TestClient
from starlette.websockets import WebSocketDisconnect

from app.core.config import Settings
from app.main import create_app
from app.modules.alerts.broadcaster import AlertBroadcaster
from app.modules.alerts.dependencies import get_alert_repository
from app.modules.alerts.repository import AlertRecord
from app.modules.auth.dependencies import get_user_repository
from tests.test_alerts import FakeAlertRepository, make_alert_record
from tests.test_videos import FakeUserRepository

SECRET = "test-secret-with-at-least-32-bytes-long"


def make_token(
    user_id: UUID,
    exp_delta: timedelta = timedelta(hours=1),
    secret: str = SECRET,
) -> str:
    now = datetime.now(timezone.utc)
    claims = {
        "sub": str(user_id),
        "exp": int((now + exp_delta).timestamp()),
        "iat": int(now.timestamp()),
    }
    return jwt.encode(claims, secret, algorithm="HS256")


def make_ws_client(
    tmp_path: Path,
    user_repository: FakeUserRepository | None = None,
    alert_repository: FakeAlertRepository | None = None,
):
    user_repo = user_repository or FakeUserRepository(permissions={"alerts.read", "alerts.review"})
    alert_repo = alert_repository or FakeAlertRepository()
    settings = Settings(
        database_url="postgresql+psycopg://user:pass@127.0.0.1:1/none",
        jwt_secret=SECRET,
        storage_dir=str(tmp_path),
    )
    app = create_app(settings)
    app.dependency_overrides[get_user_repository] = lambda: user_repo
    app.dependency_overrides[get_alert_repository] = lambda: alert_repo
    return TestClient(app), user_repo, alert_repo, app


def test_ws_auth_success_sends_ready(tmp_path: Path):
    client, user_repo, _, _ = make_ws_client(tmp_path)
    token = make_token(user_repo.user_id)

    with client.websocket_connect("/api/v1/alerts/ws") as ws:
        ws.send_json({"type": "auth", "token": token})
        data = ws.receive_json()
        assert data == {"type": "ready"}


def test_ws_bad_token_closes_1008(tmp_path: Path):
    client, _, _, _ = make_ws_client(tmp_path)

    with client.websocket_connect("/api/v1/alerts/ws") as ws:
        ws.send_json({"type": "auth", "token": "not-a-valid-jwt"})
        with pytest.raises(WebSocketDisconnect) as exc:
            ws.receive_json()
        assert exc.value.code == 1008


def test_ws_expired_token_closes_1008(tmp_path: Path):
    client, user_repo, _, _ = make_ws_client(tmp_path)
    token = make_token(user_repo.user_id, exp_delta=timedelta(seconds=-30))

    with client.websocket_connect("/api/v1/alerts/ws") as ws:
        ws.send_json({"type": "auth", "token": token})
        with pytest.raises(WebSocketDisconnect) as exc:
            ws.receive_json()
        assert exc.value.code == 1008


def test_ws_user_without_alerts_read_closes_1008(tmp_path: Path):
    user_repo = FakeUserRepository(permissions={"videos.read"})  # lacks alerts.read
    client, _, _, _ = make_ws_client(tmp_path, user_repository=user_repo)
    token = make_token(user_repo.user_id)

    with client.websocket_connect("/api/v1/alerts/ws") as ws:
        ws.send_json({"type": "auth", "token": token})
        with pytest.raises(WebSocketDisconnect) as exc:
            ws.receive_json()
        assert exc.value.code == 1008


def test_ws_invalid_first_message_closes_1008(tmp_path: Path):
    client, _, _, _ = make_ws_client(tmp_path)

    with client.websocket_connect("/api/v1/alerts/ws") as ws:
        ws.send_json({"type": "ping"})  # First message must be auth
        with pytest.raises(WebSocketDisconnect) as exc:
            ws.receive_json()
        assert exc.value.code == 1008


def test_ws_ping_pong(tmp_path: Path):
    client, user_repo, _, _ = make_ws_client(tmp_path)
    token = make_token(user_repo.user_id)

    with client.websocket_connect("/api/v1/alerts/ws") as ws:
        ws.send_json({"type": "auth", "token": token})
        assert ws.receive_json() == {"type": "ready"}

        ws.send_json({"type": "ping"})
        assert ws.receive_json() == {"type": "pong"}


def test_ws_broadcast_reaches_client_without_paths(tmp_path: Path):
    client, user_repo, _, app = make_ws_client(tmp_path)
    token = make_token(user_repo.user_id)

    record = make_alert_record(
        snapshot_path="alerts/abc/123.jpg",
        clip_path="alerts/abc/123.mp4",
    )

    with client.websocket_connect("/api/v1/alerts/ws") as ws:
        ws.send_json({"type": "auth", "token": token})
        assert ws.receive_json() == {"type": "ready"}

        # Trigger broadcast directly via app's alert_broadcaster
        import asyncio
        broadcaster: AlertBroadcaster = app.state.alert_broadcaster
        asyncio.run(broadcaster.broadcast_alert_record(record))

        msg = ws.receive_json()
        assert msg["type"] == "alert"
        alert = msg["alert"]
        assert alert["id"] == str(record.id)
        assert alert["alert_type"] == "intrusion"
        assert alert["has_snapshot"] is True
        assert alert["has_clip"] is True
        # Verify paths are never exposed
        assert "snapshot_path" not in alert
        assert "clip_path" not in alert


def test_broadcaster_slow_client_dropped_without_blocking_others():
    from app.modules.alerts.broadcaster import AlertBroadcaster, BroadcasterClient

    async def _run():
        broadcaster = AlertBroadcaster()

        # Fast client
        class DummyWs:
            def __init__(self):
                self.closed = False
                self.close_code = None

            async def send_json(self, data):
                pass

            async def close(self, code=1000):
                self.closed = True
                self.close_code = code

        ws_fast = DummyWs()
        ws_slow = DummyWs()

        client_fast = BroadcasterClient(ws_fast, uuid4(), queue_size=10)
        client_slow = BroadcasterClient(ws_slow, uuid4(), queue_size=2)

        broadcaster.add_client(client_fast)
        broadcaster.add_client(client_slow)

        # Broadcast 5 messages: client_slow has queue_size=2 and never consumes
        for i in range(5):
            await broadcaster.broadcast({"type": "alert", "alert": {"index": i}})

        # client_fast has 5 messages in queue
        assert client_fast.queue.qsize() == 5
        # client_slow must be dropped because its queue overflowed
        assert client_slow.dropped is True
        assert client_slow not in broadcaster.clients

    import asyncio
    asyncio.run(_run())


def test_broadcast_does_not_block_the_event_loop_while_checking_users():
    import asyncio
    import time
    from types import SimpleNamespace

    from app.modules.alerts.broadcaster import BroadcasterClient

    class SlowUserRepository:
        def get_by_id(self, session, user_id):
            time.sleep(0.3)  # a slow database query
            return SimpleNamespace(is_active=True)

    class SessionContext:
        def __enter__(self): return self
        def __exit__(self, *args): return False

    async def _run():
        broadcaster = AlertBroadcaster(session_factory=SessionContext, user_repository_factory=SlowUserRepository)
        broadcaster.add_client(BroadcasterClient(websocket=None, user_id=uuid4()))
        ticks = 0

        async def ticker():
            nonlocal ticks
            while True:
                await asyncio.sleep(0.01)
                ticks += 1

        task = asyncio.create_task(ticker())
        await broadcaster.broadcast({"type": "alert", "alert": {}})
        task.cancel()
        return ticks

    # With a blocking call the ticker cannot run during the 0.3 s query.
    assert asyncio.run(_run()) >= 10


def test_ws_deactivated_user_closed_on_broadcast(tmp_path: Path):
    client, user_repo, _, app = make_ws_client(tmp_path)
    token = make_token(user_repo.user_id)

    with client.websocket_connect("/api/v1/alerts/ws") as ws:
        ws.send_json({"type": "auth", "token": token})
        assert ws.receive_json() == {"type": "ready"}

        # Deactivate user
        user_repo.user.is_active = False

        # Broadcast alert
        import asyncio
        broadcaster: AlertBroadcaster = app.state.alert_broadcaster
        record = make_alert_record()
        asyncio.run(broadcaster.broadcast_alert_record(record))

        # Client should be disconnected with 1008
        with pytest.raises(WebSocketDisconnect) as exc:
            ws.receive_json()
        assert exc.value.code == 1008

