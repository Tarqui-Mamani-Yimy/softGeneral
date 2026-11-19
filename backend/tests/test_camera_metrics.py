import asyncio
import json
from pathlib import Path
from uuid import uuid4

from app.modules.alerts.broadcaster import AlertBroadcaster, BroadcasterClient
from tests.test_alerts_ws import make_token, make_ws_client
from tests.test_videos import FakeUserRepository

CAMERA_ID = str(uuid4())
METRICS = {"camera_id": CAMERA_ID, "analysis_fps": 1.5, "published_fps": 24.0, "dropped_frames": 2, "frame_to_alert_ms": None, "people_tracked": 1, "detections": {"person": 1}, "updated_at": "2026-11-19T10:00:00+00:00"}


class DummyWs:
    async def send_json(self, data): pass
    async def close(self, code=1000): pass


def test_camera_metrics_reach_only_clients_with_cameras_read():
    async def run():
        broadcaster = AlertBroadcaster()
        allowed = BroadcasterClient(DummyWs(), uuid4(), permissions={"alerts.read", "cameras.read"})
        denied = BroadcasterClient(DummyWs(), uuid4(), permissions={"alerts.read"})
        broadcaster.add_client(allowed)
        broadcaster.add_client(denied)

        assert await broadcaster.broadcast_camera_metrics(json.dumps(METRICS)) is True

        assert denied.queue.qsize() == 0
        message = allowed.queue.get_nowait()
        assert message == {"type": "camera_metrics", "camera_id": CAMERA_ID, "metrics": {k: v for k, v in METRICS.items() if k != "camera_id"}}
    asyncio.run(run())


def test_malformed_camera_metrics_are_dropped():
    async def run():
        broadcaster = AlertBroadcaster()
        client = BroadcasterClient(DummyWs(), uuid4(), permissions={"cameras.read"})
        broadcaster.add_client(client)
        bad = [
            "not json",
            json.dumps([1, 2]),
            json.dumps({**METRICS, "camera_id": "not-a-uuid"}),
            json.dumps({**METRICS, "analysis_fps": "fast"}),
            json.dumps({**METRICS, "people_tracked": True}),
            json.dumps({**METRICS, "detections": {"person": "many"}}),
            json.dumps({k: v for k, v in METRICS.items() if k != "published_fps"}),
        ]
        for raw in bad:
            assert await broadcaster.broadcast_camera_metrics(raw) is False
        assert client.queue.qsize() == 0
    asyncio.run(run())


def test_camera_metrics_message_never_carries_paths_or_urls():
    async def run():
        broadcaster = AlertBroadcaster()
        client = BroadcasterClient(DummyWs(), uuid4(), permissions={"cameras.read"})
        broadcaster.add_client(client)
        await broadcaster.broadcast_camera_metrics(json.dumps({**METRICS, "source_url": "rtsp://secret", "snapshot_path": "a/b.jpg"}))
        text = json.dumps(client.queue.get_nowait())
        assert "rtsp" not in text and "source_url" not in text and "path" not in text
    asyncio.run(run())


def test_websocket_stores_permissions_and_forwards_metrics_end_to_end(tmp_path: Path):
    with_cams = FakeUserRepository(permissions={"alerts.read", "cameras.read"})
    client, user_repo, _, app = make_ws_client(tmp_path, user_repository=with_cams)
    with client.websocket_connect("/api/v1/alerts/ws") as ws:
        ws.send_json({"type": "auth", "token": make_token(user_repo.user_id)})
        assert ws.receive_json() == {"type": "ready"}
        asyncio.run(app.state.alert_broadcaster.broadcast_camera_metrics(json.dumps(METRICS)))
        message = ws.receive_json()
        assert message["type"] == "camera_metrics" and message["camera_id"] == CAMERA_ID


def test_websocket_without_cameras_read_gets_no_metrics(tmp_path: Path):
    client, user_repo, _, app = make_ws_client(tmp_path)  # alerts.read + alerts.review only
    with client.websocket_connect("/api/v1/alerts/ws") as ws:
        ws.send_json({"type": "auth", "token": make_token(user_repo.user_id)})
        assert ws.receive_json() == {"type": "ready"}
        asyncio.run(app.state.alert_broadcaster.broadcast_camera_metrics(json.dumps(METRICS)))
        ws.send_json({"type": "ping"})
        assert ws.receive_json() == {"type": "pong"}
