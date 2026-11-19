from datetime import UTC, datetime
from io import BytesIO
from pathlib import Path
from uuid import UUID, uuid4

import pytest
from fastapi.testclient import TestClient

from app.core.config import Settings
from app.main import API_PREFIX, create_app
from app.modules.alerts.dependencies import get_alert_repository
from app.modules.alerts.repository import AlertRecord
from app.modules.auth.dependencies import get_user_repository
from tests.test_videos import FakeUserRepository, make_auth_headers

SECRET = "test-secret-with-at-least-32-bytes-long"


def make_alert_record(
    alert_id: UUID | None = None,
    alert_type: str = "intrusion",
    status: str = "pending",
    confidence: float = 0.95,
    video_job_id: UUID | None = None,
    snapshot_path: str | None = None,
    clip_path: str | None = None,
) -> AlertRecord:
    now = datetime.now(UTC)
    return AlertRecord(
        id=alert_id or uuid4(),
        alert_type=alert_type,
        status=status,
        confidence=confidence,
        occurred_at=now,
        camera_id=None,
        video_job_id=video_job_id or uuid4(),
        track_id=1,
        snapshot_path=snapshot_path,
        clip_path=clip_path,
        details={"zone": "field"},
        reviewed_by=None,
        reviewed_at=None,
        review_notes=None,
        created_at=now,
    )


class FakeAlertRepository:
    def __init__(self):
        self.alerts: dict[UUID, AlertRecord] = {}
        self.audit_entries: list[dict] = []

    def get_by_id(self, session, alert_id: UUID) -> AlertRecord | None:
        return self.alerts.get(alert_id)

    def list_alerts(
        self,
        session,
        status: str | None = None,
        alert_type: str | None = None,
        video_job_id: UUID | None = None,
        limit: int = 50,
        offset: int = 0,
    ) -> list[AlertRecord]:
        items = list(self.alerts.values())
        if status:
            items = [a for a in items if a.status == status]
        if alert_type:
            items = [a for a in items if a.alert_type == alert_type]
        if video_job_id:
            items = [a for a in items if a.video_job_id == video_job_id]
        items.sort(key=lambda a: a.occurred_at, reverse=True)
        return items[offset : offset + limit]

    def review_alert(
        self,
        session,
        alert_id: UUID,
        reviewer_id: UUID,
        status: str,
        notes: str | None,
    ) -> tuple[AlertRecord | None, str]:
        alert = self.alerts.get(alert_id)
        if alert is None:
            return None, "not_found"
        if alert.status != "pending":
            return None, "already_reviewed"

        alert.status = status
        alert.reviewed_by = reviewer_id
        alert.reviewed_at = datetime.now(UTC)
        alert.review_notes = notes

        self.audit_entries.append({
            "user_id": reviewer_id,
            "action": f"alert.{status}",
            "entity_type": "alert",
            "entity_id": str(alert_id),
            "details": {"notes": notes} if notes else {},
        })
        return alert, "ok"


def make_client(
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
    return TestClient(app), user_repo, alert_repo


def test_list_alerts_with_filters(tmp_path: Path):
    client, user_repo, alert_repo = make_client(tmp_path)
    headers = make_auth_headers(user_repo.user_id)

    job_a = uuid4()
    job_b = uuid4()

    a1 = make_alert_record(alert_type="intrusion", status="pending", video_job_id=job_a)
    a2 = make_alert_record(alert_type="weapon", status="confirmed", video_job_id=job_a)
    a3 = make_alert_record(alert_type="intrusion", status="pending", video_job_id=job_b)
    for a in [a1, a2, a3]:
        alert_repo.alerts[a.id] = a

    # No filter
    res = client.get(f"{API_PREFIX}/alerts", headers=headers)
    assert res.status_code == 200
    assert len(res.json()) == 3

    # Filter by status
    res = client.get(f"{API_PREFIX}/alerts?status=pending", headers=headers)
    assert res.status_code == 200
    assert len(res.json()) == 2
    assert all(item["status"] == "pending" for item in res.json())

    # Filter by alert_type
    res = client.get(f"{API_PREFIX}/alerts?alert_type=weapon", headers=headers)
    assert res.status_code == 200
    assert len(res.json()) == 1
    assert res.json()[0]["id"] == str(a2.id)

    # Filter by video_job_id
    res = client.get(f"{API_PREFIX}/alerts?video_job_id={job_b}", headers=headers)
    assert res.status_code == 200
    assert len(res.json()) == 1
    assert res.json()[0]["id"] == str(a3.id)


def test_get_alert_404_and_format(tmp_path: Path):
    client, user_repo, alert_repo = make_client(tmp_path)
    headers = make_auth_headers(user_repo.user_id)

    # Missing alert
    res = client.get(f"{API_PREFIX}/alerts/{uuid4()}", headers=headers)
    assert res.status_code == 404
    assert res.json() == {"detail": "Alert not found"}

    # Existing alert
    a = make_alert_record(snapshot_path="/dummy/snap.jpg", clip_path=None)
    alert_repo.alerts[a.id] = a
    res = client.get(f"{API_PREFIX}/alerts/{a.id}", headers=headers)
    assert res.status_code == 200
    body = res.json()
    assert body["id"] == str(a.id)
    assert body["has_snapshot"] is True
    assert body["has_clip"] is False
    assert "snapshot_path" not in body
    assert "clip_path" not in body


def test_review_alert_ok_and_audit(tmp_path: Path):
    client, user_repo, alert_repo = make_client(tmp_path)
    headers = make_auth_headers(user_repo.user_id)

    a = make_alert_record(status="pending")
    alert_repo.alerts[a.id] = a

    res = client.post(
        f"{API_PREFIX}/alerts/{a.id}/review",
        headers=headers,
        json={"status": "confirmed", "notes": "Verified pitch intruder"},
    )
    assert res.status_code == 200
    body = res.json()
    assert body["status"] == "confirmed"
    assert body["review_notes"] == "Verified pitch intruder"
    assert body["reviewed_by"] == str(user_repo.user_id)
    assert body["reviewed_at"] is not None

    # Audit check
    assert len(alert_repo.audit_entries) == 1
    audit = alert_repo.audit_entries[0]
    assert audit["action"] == "alert.confirmed"
    assert audit["entity_id"] == str(a.id)
    assert audit["entity_type"] == "alert"


def test_review_twice_returns_409(tmp_path: Path):
    client, user_repo, alert_repo = make_client(tmp_path)
    headers = make_auth_headers(user_repo.user_id)

    a = make_alert_record(status="pending")
    alert_repo.alerts[a.id] = a

    first = client.post(
        f"{API_PREFIX}/alerts/{a.id}/review",
        headers=headers,
        json={"status": "confirmed"},
    )
    assert first.status_code == 200

    second = client.post(
        f"{API_PREFIX}/alerts/{a.id}/review",
        headers=headers,
        json={"status": "false_alarm"},
    )
    assert second.status_code == 409
    assert second.json() == {"detail": "Alert already reviewed"}


def test_review_invalid_status_returns_422(tmp_path: Path):
    client, user_repo, alert_repo = make_client(tmp_path)
    headers = make_auth_headers(user_repo.user_id)

    a = make_alert_record(status="pending")
    alert_repo.alerts[a.id] = a

    res = client.post(
        f"{API_PREFIX}/alerts/{a.id}/review",
        headers=headers,
        json={"status": "unknown_status"},
    )
    assert res.status_code == 422


def test_missing_permission_returns_403(tmp_path: Path):
    # User lacks alerts.read
    no_read_user = FakeUserRepository(permissions={"videos.read"})
    client, _, alert_repo = make_client(tmp_path, user_repository=no_read_user)
    headers = make_auth_headers(no_read_user.user_id)

    a = make_alert_record()
    alert_repo.alerts[a.id] = a

    res = client.get(f"{API_PREFIX}/alerts", headers=headers)
    assert res.status_code == 403

    res_single = client.get(f"{API_PREFIX}/alerts/{a.id}", headers=headers)
    assert res_single.status_code == 403

    # User has alerts.read but lacks alerts.review
    read_only_user = FakeUserRepository(permissions={"alerts.read"})
    client_ro, _, alert_repo_ro = make_client(tmp_path, user_repository=read_only_user)
    alert_repo_ro.alerts[a.id] = a
    ro_headers = make_auth_headers(read_only_user.user_id)

    res_review = client_ro.post(
        f"{API_PREFIX}/alerts/{a.id}/review",
        headers=ro_headers,
        json={"status": "confirmed"},
    )
    assert res_review.status_code == 403


def test_snapshot_and_clip_200_and_content_type(tmp_path: Path):
    client, user_repo, alert_repo = make_client(tmp_path)
    headers = make_auth_headers(user_repo.user_id)

    snap_file = tmp_path / "alerts" / "snap_1.jpg"
    snap_file.parent.mkdir(parents=True, exist_ok=True)
    snap_file.write_bytes(b"jpeg-bytes")

    clip_file = tmp_path / "alerts" / "clip_1.mp4"
    clip_file.write_bytes(b"mp4-bytes")

    a = make_alert_record(snapshot_path=str(snap_file), clip_path=str(clip_file))
    alert_repo.alerts[a.id] = a

    # Snapshot
    snap_res = client.get(f"{API_PREFIX}/alerts/{a.id}/snapshot", headers=headers)
    assert snap_res.status_code == 200
    assert snap_res.headers["content-type"] == "image/jpeg"
    assert snap_res.content == b"jpeg-bytes"

    # Clip
    clip_res = client.get(f"{API_PREFIX}/alerts/{a.id}/clip", headers=headers)
    assert clip_res.status_code == 200
    assert clip_res.headers["content-type"] == "video/mp4"
    assert clip_res.content == b"mp4-bytes"


def test_snapshot_and_clip_refuse_path_outside_storage_dir(tmp_path: Path):
    client, user_repo, alert_repo = make_client(tmp_path)
    headers = make_auth_headers(user_repo.user_id)

    outside = tmp_path.parent / "secret_snapshot.jpg"
    outside.write_bytes(b"outside-bytes")

    # Outside via path traversal
    a = make_alert_record(snapshot_path=str(outside))
    alert_repo.alerts[a.id] = a

    res = client.get(f"{API_PREFIX}/alerts/{a.id}/snapshot", headers=headers)
    assert res.status_code == 404

    # Symlink outside
    alerts_dir = tmp_path / "alerts"
    alerts_dir.mkdir(parents=True, exist_ok=True)
    symlink_file = alerts_dir / "symlink_snap.jpg"
    symlink_file.symlink_to(outside)

    a_sym = make_alert_record(snapshot_path=str(symlink_file))
    alert_repo.alerts[a_sym.id] = a_sym

    res_sym = client.get(f"{API_PREFIX}/alerts/{a_sym.id}/snapshot", headers=headers)
    assert res_sym.status_code == 404

    symlink_file.unlink()
    outside.unlink()
