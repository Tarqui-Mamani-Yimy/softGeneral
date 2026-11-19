from datetime import UTC, datetime
from pathlib import Path
from uuid import UUID, uuid4

import pytest
from fastapi.testclient import TestClient

from app.core.config import Settings
from app.main import API_PREFIX, create_app
from app.modules.auth.dependencies import get_user_repository
from app.modules.cameras.dependencies import get_camera_repository
from app.modules.cameras.repository import CameraRecord
from tests.test_videos import FakeUserRepository, make_auth_headers

SECRET = "test-secret-with-at-least-32-bytes-long"


def make_camera_record(
    camera_id: UUID | None = None,
    code: str = "cam_gate_01",
    name: str = "Gate Camera",
    location: str = "Gate 1",
    source_type: str = "rtsp",
    source_url: str = "rtsp://127.0.0.1:8554/cam_gate_01",
    is_active: bool = True,
) -> CameraRecord:
    now = datetime.now(UTC)
    return CameraRecord(
        id=camera_id or uuid4(),
        code=code,
        name=name,
        location=location,
        source_type=source_type,
        source_url=source_url,
        is_active=is_active,
        created_at=now,
        updated_at=now,
    )


class FakeCameraRepository:
    def __init__(self):
        self.cameras: dict[UUID, CameraRecord] = {}
        self.audit_log: list[dict] = []

    def list_cameras(self, session) -> list[CameraRecord]:
        return list(self.cameras.values())

    def get_by_id(self, session, camera_id: UUID) -> CameraRecord | None:
        return self.cameras.get(camera_id)

    def get_by_code(self, session, code: str) -> CameraRecord | None:
        for cam in self.cameras.values():
            if cam.code == code:
                return cam
        return None

    def create(self, session, user_id: UUID, **values) -> CameraRecord:
        cam_id = uuid4()
        now = datetime.now(UTC)
        record = CameraRecord(
            id=cam_id,
            code=values["code"],
            name=values["name"],
            location=values.get("location", ""),
            source_type=values["source_type"],
            source_url=values["source_url"],
            is_active=values.get("is_active", True),
            created_at=now,
            updated_at=now,
        )
        self.cameras[cam_id] = record
        self.audit_log.append({
            "user_id": user_id,
            "action": "camera.created",
            "entity_type": "camera",
            "entity_id": str(cam_id),
            "details": {"code": record.code, "name": record.name},
        })
        return record

    def update(self, session, camera_id: UUID, user_id: UUID, **values) -> CameraRecord | None:
        cam = self.cameras.get(camera_id)
        if not cam:
            return None
        for k, v in values.items():
            if v is not None:
                setattr(cam, k, v)
        cam.updated_at = datetime.now(UTC)
        self.audit_log.append({
            "user_id": user_id,
            "action": "camera.updated",
            "entity_type": "camera",
            "entity_id": str(camera_id),
            "details": values,
        })
        return cam

    def disable(self, session, camera_id: UUID, user_id: UUID) -> CameraRecord | None:
        cam = self.cameras.get(camera_id)
        if not cam:
            return None
        cam.is_active = False
        cam.updated_at = datetime.now(UTC)
        self.audit_log.append({
            "user_id": user_id,
            "action": "camera.disabled",
            "entity_type": "camera",
            "entity_id": str(camera_id),
            "details": {},
        })
        return cam


def make_client(
    tmp_path: Path,
    user_repository: FakeUserRepository | None = None,
    camera_repository: FakeCameraRepository | None = None,
):
    user_repo = user_repository or FakeUserRepository(permissions={"cameras.read"})
    cam_repo = camera_repository or FakeCameraRepository()
    settings = Settings(
        database_url="postgresql+psycopg://user:pass@127.0.0.1:1/none",
        jwt_secret=SECRET,
        storage_dir=str(tmp_path),
    )
    app = create_app(settings)
    app.dependency_overrides[get_user_repository] = lambda: user_repo
    app.dependency_overrides[get_camera_repository] = lambda: cam_repo
    return TestClient(app), user_repo, cam_repo


def test_list_cameras_as_guard_hides_source_url(tmp_path: Path):
    guard_repo = FakeUserRepository(permissions={"cameras.read"})
    cam_repo = FakeCameraRepository()
    cam = make_camera_record(code="cam_south_01", source_url="rtsp://127.0.0.1:8554/cam_south_01")
    cam_repo.cameras[cam.id] = cam

    client, user_repo, _ = make_client(tmp_path, user_repository=guard_repo, camera_repository=cam_repo)
    headers = make_auth_headers(user_repo.user_id)

    res = client.get(f"{API_PREFIX}/cameras", headers=headers)
    assert res.status_code == 200
    data = res.json()
    assert len(data) == 1
    assert data[0]["code"] == "cam_south_01"
    assert data[0]["live_path"] == "cam_south_01_annotated"
    assert data[0]["source_url"] is None


def test_list_cameras_as_admin_shows_source_url(tmp_path: Path):
    admin_repo = FakeUserRepository(permissions={"cameras.read", "cameras.manage"})
    cam_repo = FakeCameraRepository()
    cam = make_camera_record(code="cam_south_01", source_url="rtsp://127.0.0.1:8554/cam_south_01")
    cam_repo.cameras[cam.id] = cam

    client, user_repo, _ = make_client(tmp_path, user_repository=admin_repo, camera_repository=cam_repo)
    headers = make_auth_headers(user_repo.user_id)

    res = client.get(f"{API_PREFIX}/cameras", headers=headers)
    assert res.status_code == 200
    data = res.json()
    assert len(data) == 1
    assert data[0]["source_url"] == "rtsp://127.0.0.1:8554/cam_south_01"
    assert data[0]["live_path"] == "cam_south_01_annotated"


def test_get_camera_by_id_guard_vs_admin(tmp_path: Path):
    cam_repo = FakeCameraRepository()
    cam = make_camera_record(code="cam_east_01", source_url="rtsp://127.0.0.1:8554/cam_east_01")
    cam_repo.cameras[cam.id] = cam

    # Guard view
    guard_repo = FakeUserRepository(permissions={"cameras.read"})
    client_guard, u_guard, _ = make_client(tmp_path, user_repository=guard_repo, camera_repository=cam_repo)
    res = client_guard.get(f"{API_PREFIX}/cameras/{cam.id}", headers=make_auth_headers(u_guard.user_id))
    assert res.status_code == 200
    assert res.json()["source_url"] is None
    assert res.json()["live_path"] == "cam_east_01_annotated"

    # Admin view
    admin_repo = FakeUserRepository(permissions={"cameras.read", "cameras.manage"})
    client_admin, u_admin, _ = make_client(tmp_path, user_repository=admin_repo, camera_repository=cam_repo)
    res_admin = client_admin.get(f"{API_PREFIX}/cameras/{cam.id}", headers=make_auth_headers(u_admin.user_id))
    assert res_admin.status_code == 200
    assert res_admin.json()["source_url"] == "rtsp://127.0.0.1:8554/cam_east_01"


def test_get_camera_not_found_returns_404(tmp_path: Path):
    client, user_repo, _ = make_client(tmp_path)
    res = client.get(f"{API_PREFIX}/cameras/{uuid4()}", headers=make_auth_headers(user_repo.user_id))
    assert res.status_code == 404
    assert res.json() == {"detail": "Camera not found"}


def test_create_camera_as_admin_ok(tmp_path: Path):
    admin_repo = FakeUserRepository(permissions={"cameras.manage", "cameras.read"})
    cam_repo = FakeCameraRepository()
    client, user_repo, _ = make_client(tmp_path, user_repository=admin_repo, camera_repository=cam_repo)

    payload = {
        "code": "cam_pitch_01",
        "name": "Pitch Center Camera",
        "location": "Center Line",
        "source_type": "rtsp",
        "source_url": "rtsp://127.0.0.1:8554/cam_pitch_01",
    }
    res = client.post(f"{API_PREFIX}/cameras", json=payload, headers=make_auth_headers(user_repo.user_id))
    assert res.status_code == 201
    body = res.json()
    assert body["code"] == "cam_pitch_01"
    assert body["live_path"] == "cam_pitch_01_annotated"
    assert body["source_url"] == "rtsp://127.0.0.1:8554/cam_pitch_01"
    assert body["is_active"] is True

    # Audit check
    assert len(cam_repo.audit_log) == 1
    assert cam_repo.audit_log[0]["action"] == "camera.created"
    assert cam_repo.audit_log[0]["user_id"] == user_repo.user_id


def test_create_camera_duplicate_code_returns_409(tmp_path: Path):
    admin_repo = FakeUserRepository(permissions={"cameras.manage"})
    cam_repo = FakeCameraRepository()
    cam = make_camera_record(code="cam_dup_01")
    cam_repo.cameras[cam.id] = cam

    client, user_repo, _ = make_client(tmp_path, user_repository=admin_repo, camera_repository=cam_repo)

    payload = {
        "code": "cam_dup_01",
        "name": "Duplicate",
        "source_type": "rtsp",
        "source_url": "rtsp://127.0.0.1:8554/cam_dup_01",
    }
    res = client.post(f"{API_PREFIX}/cameras", json=payload, headers=make_auth_headers(user_repo.user_id))
    assert res.status_code == 409
    assert res.json() == {"detail": "Camera code already exists"}


def test_create_camera_invalid_code_or_url_returns_422(tmp_path: Path):
    admin_repo = FakeUserRepository(permissions={"cameras.manage"})
    client, user_repo, _ = make_client(tmp_path, user_repository=admin_repo)
    headers = make_auth_headers(user_repo.user_id)

    # Invalid code formats (must match ^[a-z][a-z0-9_]{1,31}$)
    for bad_code in ["1cam", "CAM", "c", "c" * 33, "cam-test"]:
        res = client.post(
            f"{API_PREFIX}/cameras",
            json={"code": bad_code, "name": "Test", "source_type": "rtsp", "source_url": "rtsp://127.0.0.1:8554/cam"},
            headers=headers,
        )
        assert res.status_code == 422, f"Expected 422 for bad code '{bad_code}'"

    # Invalid RTSP URL (must start with rtsp:// or rtsps://)
    res = client.post(
        f"{API_PREFIX}/cameras",
        json={"code": "cam_valid", "name": "Test", "source_type": "rtsp", "source_url": "http://127.0.0.1:8554/cam"},
        headers=headers,
    )
    assert res.status_code == 422

    # Invalid Webcam URL (must be digits)
    res = client.post(
        f"{API_PREFIX}/cameras",
        json={"code": "cam_valid", "name": "Test", "source_type": "webcam", "source_url": "/dev/video0"},
        headers=headers,
    )
    assert res.status_code == 422


def test_create_camera_as_guard_returns_403(tmp_path: Path):
    guard_repo = FakeUserRepository(permissions={"cameras.read"})  # lacks cameras.manage
    client, user_repo, _ = make_client(tmp_path, user_repository=guard_repo)

    payload = {
        "code": "cam_pitch_01",
        "name": "Pitch",
        "source_type": "rtsp",
        "source_url": "rtsp://127.0.0.1:8554/pitch",
    }
    res = client.post(f"{API_PREFIX}/cameras", json=payload, headers=make_auth_headers(user_repo.user_id))
    assert res.status_code == 403
    assert res.json() == {"detail": "Permission denied"}


def test_patch_camera_updates_and_audits(tmp_path: Path):
    admin_repo = FakeUserRepository(permissions={"cameras.manage", "cameras.read"})
    cam_repo = FakeCameraRepository()
    cam = make_camera_record(code="cam_patch_01", name="Old Name")
    cam_repo.cameras[cam.id] = cam

    client, user_repo, _ = make_client(tmp_path, user_repository=admin_repo, camera_repository=cam_repo)

    res = client.patch(
        f"{API_PREFIX}/cameras/{cam.id}",
        json={"name": "Updated Name", "location": "New Gate"},
        headers=make_auth_headers(user_repo.user_id),
    )
    assert res.status_code == 200
    assert res.json()["name"] == "Updated Name"
    assert res.json()["location"] == "New Gate"
    assert cam_repo.audit_log[-1]["action"] == "camera.updated"


def test_disable_camera_sets_inactive_and_audits(tmp_path: Path):
    admin_repo = FakeUserRepository(permissions={"cameras.manage", "cameras.read"})
    cam_repo = FakeCameraRepository()
    cam = make_camera_record(code="cam_dis_01", is_active=True)
    cam_repo.cameras[cam.id] = cam

    client, user_repo, _ = make_client(tmp_path, user_repository=admin_repo, camera_repository=cam_repo)

    res = client.post(
        f"{API_PREFIX}/cameras/{cam.id}/disable",
        headers=make_auth_headers(user_repo.user_id),
    )
    assert res.status_code == 200
    assert res.json()["is_active"] is False
    assert cam_repo.audit_log[-1]["action"] == "camera.disabled"
