from datetime import UTC, datetime, timedelta
from pathlib import Path
from uuid import uuid4

from fastapi.testclient import TestClient

from app.core.config import Settings
from app.main import API_PREFIX, create_app
from app.modules.auth.dependencies import get_user_repository
from app.modules.cameras.dependencies import get_camera_repository
from app.modules.demo.dependencies import get_demo_repository
from tests.test_cameras import SECRET, FakeCameraRepository, make_camera_record
from tests.test_videos import FakeUserRepository, make_auth_headers


class FakeDemoRepository:
    def __init__(self, cameras: FakeCameraRepository):
        self.cameras = cameras

    def list_active_demo(self, session):
        found = [c for c in self.cameras.cameras.values() if c.is_active and c.code.startswith("demo_")]
        return sorted(found, key=lambda c: c.created_at, reverse=True)


def make_client(tmp_path: Path, permissions=frozenset({"cameras.manage"}), **settings_kwargs):
    user_repo = FakeUserRepository(permissions=set(permissions))
    cam_repo = FakeCameraRepository()
    settings = Settings(
        database_url="postgresql+psycopg://user:pass@127.0.0.1:1/none",
        jwt_secret=SECRET,
        storage_dir=str(tmp_path),
        **settings_kwargs,
    )
    app = create_app(settings)
    app.dependency_overrides[get_user_repository] = lambda: user_repo
    app.dependency_overrides[get_camera_repository] = lambda: cam_repo
    app.dependency_overrides[get_demo_repository] = lambda: FakeDemoRepository(cam_repo)
    client = TestClient(app)
    return client, make_auth_headers(user_repo.user_id), cam_repo


def test_create_returns_contract_without_source_url(tmp_path: Path):
    client, headers, cam_repo = make_client(
        tmp_path, demo_whip_base_url="https://media.example.com", mediamtx_rtsp_read_url="rtsp://mtx:8554"
    )
    res = client.post(f"{API_PREFIX}/demo/sessions", headers=headers)
    assert res.status_code == 201
    body = res.json()
    assert set(body) == {"id", "camera_code", "publish_path", "whip_url", "live_path", "expires_at"}
    code = body["camera_code"]
    assert len(code) == len("demo_") + 8 and code.startswith("demo_")
    assert body["publish_path"] == code
    assert body["whip_url"] == f"https://media.example.com/{code}/whip"
    assert body["live_path"] == f"{code}_annotated"
    assert "rtsp" not in res.text
    camera = cam_repo.cameras[next(iter(cam_repo.cameras))]
    assert str(camera.id) == body["id"]
    assert (camera.name, camera.location, camera.source_type) == ("Browser demo", "Demo", "rtsp")
    assert camera.source_url == f"rtsp://mtx:8554/{code}"
    expires = datetime.fromisoformat(body["expires_at"])
    assert expires == camera.created_at + timedelta(minutes=10)


def test_create_uses_default_urls(tmp_path: Path):
    client, headers, _ = make_client(tmp_path)
    body = client.post(f"{API_PREFIX}/demo/sessions", headers=headers).json()
    assert body["whip_url"] == f"http://localhost:8889/{body['camera_code']}/whip"


def test_second_create_disables_first_demo_and_audits(tmp_path: Path):
    client, headers, cam_repo = make_client(tmp_path)
    regular = make_camera_record(code="cam_gate_01")
    cam_repo.cameras[regular.id] = regular
    first = client.post(f"{API_PREFIX}/demo/sessions", headers=headers).json()
    second = client.post(f"{API_PREFIX}/demo/sessions", headers=headers).json()
    assert first["id"] != second["id"]
    by_id = {str(c.id): c for c in cam_repo.cameras.values()}
    assert by_id[first["id"]].is_active is False
    assert by_id[second["id"]].is_active is True
    assert regular.is_active is True
    assert any(a["action"] == "camera.disabled" and a["entity_id"] == first["id"] for a in cam_repo.audit_log)


def test_current_returns_active_session(tmp_path: Path):
    client, headers, _ = make_client(tmp_path)
    created = client.post(f"{API_PREFIX}/demo/sessions", headers=headers).json()
    res = client.get(f"{API_PREFIX}/demo/sessions/current", headers=headers)
    assert res.status_code == 200
    assert res.json() == created


def test_current_is_404_when_none(tmp_path: Path):
    client, headers, _ = make_client(tmp_path)
    res = client.get(f"{API_PREFIX}/demo/sessions/current", headers=headers)
    assert res.status_code == 404
    assert res.json() == {"detail": "No active demo session"}


def test_current_is_404_when_expired(tmp_path: Path):
    client, headers, cam_repo = make_client(tmp_path, demo_max_minutes=10)
    old = make_camera_record(code="demo_abcd1234")
    old.created_at = datetime.now(UTC) - timedelta(minutes=11)
    cam_repo.cameras[old.id] = old
    res = client.get(f"{API_PREFIX}/demo/sessions/current", headers=headers)
    assert res.status_code == 404
    assert res.json() == {"detail": "No active demo session"}


def test_delete_disables_demo_camera(tmp_path: Path):
    client, headers, cam_repo = make_client(tmp_path)
    created = client.post(f"{API_PREFIX}/demo/sessions", headers=headers).json()
    res = client.delete(f"{API_PREFIX}/demo/sessions/{created['id']}", headers=headers)
    assert res.status_code == 204
    assert res.content == b""
    assert all(not c.is_active for c in cam_repo.cameras.values())
    assert any(a["action"] == "camera.disabled" for a in cam_repo.audit_log)


def test_delete_never_disables_regular_camera(tmp_path: Path):
    client, headers, cam_repo = make_client(tmp_path)
    regular = make_camera_record(code="cam_gate_01")
    cam_repo.cameras[regular.id] = regular
    res = client.delete(f"{API_PREFIX}/demo/sessions/{regular.id}", headers=headers)
    assert res.status_code == 404
    assert regular.is_active is True
    assert cam_repo.audit_log == []


def test_delete_unknown_id_is_404(tmp_path: Path):
    client, headers, _ = make_client(tmp_path)
    assert client.delete(f"{API_PREFIX}/demo/sessions/{uuid4()}", headers=headers).status_code == 404


def test_endpoints_require_cameras_manage(tmp_path: Path):
    client, headers, _ = make_client(tmp_path, permissions={"cameras.read"})
    assert client.post(f"{API_PREFIX}/demo/sessions", headers=headers).status_code == 403
    assert client.get(f"{API_PREFIX}/demo/sessions/current", headers=headers).status_code == 403
    assert client.delete(f"{API_PREFIX}/demo/sessions/{uuid4()}", headers=headers).status_code == 403


def test_endpoints_require_token(tmp_path: Path):
    client, _, _ = make_client(tmp_path)
    assert client.post(f"{API_PREFIX}/demo/sessions").status_code == 401
    assert client.get(f"{API_PREFIX}/demo/sessions/current").status_code == 401
    assert client.delete(f"{API_PREFIX}/demo/sessions/{uuid4()}").status_code == 401


def test_stream_status_reports_annotated_readiness_from_mediamtx(tmp_path: Path):
    from app.modules.demo.dependencies import get_stream_probe

    client, headers, _ = make_client(tmp_path)
    session_id = client.post(f"{API_PREFIX}/demo/sessions", headers=headers).json()["id"]
    asked = []

    def probe(path):
        asked.append(path)
        return len(asked) > 1  # not ready on the first poll, ready on the second

    client.app.dependency_overrides[get_stream_probe] = lambda: probe

    first = client.get(f"{API_PREFIX}/demo/sessions/{session_id}/stream", headers=headers)
    second = client.get(f"{API_PREFIX}/demo/sessions/{session_id}/stream", headers=headers)

    assert (first.status_code, first.json()) == (200, {"annotated_ready": False})
    assert (second.status_code, second.json()) == (200, {"annotated_ready": True})
    assert asked[0].endswith("_annotated") and asked[0].startswith("demo_")


def test_stream_status_is_404_for_regular_or_unknown_camera(tmp_path: Path):
    from app.modules.demo.dependencies import get_stream_probe

    client, headers, cam_repo = make_client(tmp_path)
    client.app.dependency_overrides[get_stream_probe] = lambda: (lambda path: True)
    regular = make_camera_record(code="cam_gate_01")
    cam_repo.cameras[regular.id] = regular

    assert client.get(f"{API_PREFIX}/demo/sessions/{regular.id}/stream", headers=headers).status_code == 404
    assert client.get(f"{API_PREFIX}/demo/sessions/{uuid4()}/stream", headers=headers).status_code == 404


def test_mediamtx_probe_reads_the_ready_flag_and_fails_closed(monkeypatch):
    import json
    import urllib.error
    import urllib.request

    from app.modules.demo.stream import MediaMtxStreamProbe

    class Response:
        def __init__(self, body): self.body = body
        def read(self): return self.body
        def __enter__(self): return self
        def __exit__(self, *args): return False

    calls = []

    def fake_urlopen(url, timeout):
        calls.append((url, timeout))
        if "missing" in url:
            raise urllib.error.HTTPError(url, 404, "not found", None, None)
        if "down" in url:
            raise urllib.error.URLError("connection refused")
        return Response(json.dumps({"name": "x", "ready": True}).encode())

    monkeypatch.setattr(urllib.request, "urlopen", fake_urlopen)
    probe = MediaMtxStreamProbe("http://127.0.0.1:9997")

    assert probe("demo_ab12cd34_annotated") is True
    assert calls[0][0] == "http://127.0.0.1:9997/v3/paths/get/demo_ab12cd34_annotated"
    assert calls[0][1] <= 3
    assert probe("missing_annotated") is False
    assert probe("down_annotated") is False
