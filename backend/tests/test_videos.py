from datetime import UTC, datetime, timedelta
from io import BytesIO
from pathlib import Path
from uuid import UUID, uuid4

import jwt
from fastapi.testclient import TestClient
from pwdlib import PasswordHash

from app.core.config import Settings
from app.main import API_PREFIX, create_app
from app.modules.auth.dependencies import get_user_repository
from app.modules.auth.repository import UserRecord
from app.modules.videos.dependencies import get_video_repository
from app.modules.videos.repository import VideoJobRecord

PASSWORD_HASH = PasswordHash.recommended()
SECRET = "test-secret-with-at-least-32-bytes-long"


class FakeUserRepository:
    def __init__(self, permissions: set[str] | None = None):
        self.user_id = uuid4()
        self.password = "correct-password"
        self.user = UserRecord(
            id=self.user_id,
            username="guard",
            email="guard@example.com",
            full_name="Test Guard",
            role="guard",
            password_hash=PASSWORD_HASH.hash(self.password),
            is_active=True,
        )
        self.permission_codes = permissions if permissions is not None else {"videos.upload", "videos.read"}

    def find_by_identifier(self, session, identifier):
        if identifier.lower() in {self.user.username, self.user.email}:
            return self.user
        return None

    def get_by_id(self, session, user_id):
        return self.user if user_id == self.user.id else None

    def get_permissions(self, session, user_id):
        return sorted(self.permission_codes) if user_id == self.user.id and self.user.is_active else []


class FakeVideoRepository:
    def __init__(self):
        self.jobs: dict[UUID, VideoJobRecord] = {}
        self.audit_entries: list[dict] = []

    def create_job(self, session, job_id: UUID, uploaded_by: UUID, original_filename: str, input_path: str) -> VideoJobRecord:
        record = VideoJobRecord(
            id=job_id,
            uploaded_by=uploaded_by,
            original_filename=original_filename,
            input_path=input_path,
            output_path=None,
            status="queued",
            progress=0.0,
            error_message=None,
            created_at=datetime.now(UTC),
        )
        self.jobs[job_id] = record
        self.audit_entries.append({
            "user_id": uploaded_by,
            "action": "video.uploaded",
            "entity_type": "video_job",
            "entity_id": str(job_id),
            "details": {"original_filename": original_filename},
        })
        return record

    def get_by_id(self, session, job_id: UUID) -> VideoJobRecord | None:
        return self.jobs.get(job_id)

    def list_jobs(self, session, limit: int = 50, offset: int = 0) -> list[VideoJobRecord]:
        sorted_jobs = sorted(self.jobs.values(), key=lambda j: j.created_at, reverse=True)
        return sorted_jobs[offset : offset + limit]


def make_client(
    tmp_path: Path,
    user_repository: FakeUserRepository | None = None,
    video_repository: FakeVideoRepository | None = None,
    max_upload_mb: int = 500,
):
    user_repo = user_repository or FakeUserRepository()
    video_repo = video_repository or FakeVideoRepository()
    settings = Settings(
        database_url="postgresql+psycopg://user:pass@127.0.0.1:1/none",
        jwt_secret=SECRET,
        storage_dir=str(tmp_path),
        max_upload_mb=max_upload_mb,
    )
    app = create_app(settings)
    app.dependency_overrides[get_user_repository] = lambda: user_repo
    app.dependency_overrides[get_video_repository] = lambda: video_repo
    return TestClient(app), user_repo, video_repo


def make_auth_headers(user_id: UUID) -> dict[str, str]:
    now = datetime.now(UTC)
    token = jwt.encode(
        {"sub": str(user_id), "iat": now, "exp": now + timedelta(minutes=60)},
        SECRET,
        algorithm="HS256",
    )
    return {"Authorization": f"Bearer {token}"}


def test_upload_video_ok(tmp_path: Path):
    client, user_repo, video_repo = make_client(tmp_path)
    headers = make_auth_headers(user_repo.user_id)
    content = b"fake video bytes mp4"

    response = client.post(
        f"{API_PREFIX}/videos",
        headers=headers,
        files={"file": ("match_2026.mp4", BytesIO(content), "video/mp4")},
    )

    assert response.status_code == 201
    body = response.json()
    assert body["original_filename"] == "match_2026.mp4"
    assert body["status"] == "queued"
    assert body["progress"] == 0.0
    assert "created_at" in body
    job_id = UUID(body["id"])

    # Path check: saved under <storage_dir>/uploads/<uuid>.mp4
    upload_file = tmp_path / "uploads" / f"{job_id}.mp4"
    assert upload_file.is_file()
    assert upload_file.read_bytes() == content
    assert "match_2026" not in str(upload_file)

    # Repository & audit check
    assert job_id in video_repo.jobs
    assert len(video_repo.audit_entries) == 1
    assert video_repo.audit_entries[0]["action"] == "video.uploaded"
    assert video_repo.audit_entries[0]["entity_id"] == str(job_id)


def test_upload_video_unsupported_format(tmp_path: Path):
    client, user_repo, video_repo = make_client(tmp_path)
    headers = make_auth_headers(user_repo.user_id)

    response = client.post(
        f"{API_PREFIX}/videos",
        headers=headers,
        files={"file": ("malicious.exe", BytesIO(b"binary"), "application/octet-stream")},
    )

    assert response.status_code == 415
    assert response.json() == {"detail": "Unsupported video format"}
    # Ensure nothing was written
    uploads_dir = tmp_path / "uploads"
    if uploads_dir.exists():
        assert len(list(uploads_dir.iterdir())) == 0


def test_upload_video_case_insensitive_extensions(tmp_path: Path):
    client, user_repo, _ = make_client(tmp_path)
    headers = make_auth_headers(user_repo.user_id)

    for name in ["clip.MP4", "clip.AVI", "clip.MOV", "clip.MKV"]:
        response = client.post(
            f"{API_PREFIX}/videos",
            headers=headers,
            files={"file": (name, BytesIO(b"data"), "video/mp4")},
        )
        assert response.status_code == 201, f"Failed for {name}"


def test_upload_video_too_large(tmp_path: Path):
    # Set limit to 1 MB
    client, user_repo, _ = make_client(tmp_path, max_upload_mb=1)
    headers = make_auth_headers(user_repo.user_id)
    large_payload = b"x" * (1024 * 1024 + 100)  # > 1 MB

    response = client.post(
        f"{API_PREFIX}/videos",
        headers=headers,
        files={"file": ("huge.mp4", BytesIO(large_payload), "video/mp4")},
    )

    assert response.status_code == 413
    assert response.json() == {"detail": "File too large"}
    # Ensure partial file is deleted
    uploads_dir = tmp_path / "uploads"
    if uploads_dir.exists():
        assert len(list(uploads_dir.iterdir())) == 0


def test_upload_video_missing_permission(tmp_path: Path):
    # User lacks videos.upload permission
    user_repo = FakeUserRepository(permissions={"videos.read"})
    client, _, _ = make_client(tmp_path, user_repository=user_repo)
    headers = make_auth_headers(user_repo.user_id)

    response = client.post(
        f"{API_PREFIX}/videos",
        headers=headers,
        files={"file": ("video.mp4", BytesIO(b"data"), "video/mp4")},
    )

    assert response.status_code == 403
    assert response.json() == {"detail": "Permission denied"}


def test_upload_video_no_token(tmp_path: Path):
    client, _, _ = make_client(tmp_path)

    response = client.post(
        f"{API_PREFIX}/videos",
        files={"file": ("video.mp4", BytesIO(b"data"), "video/mp4")},
    )

    assert response.status_code == 401
    assert response.json() == {"detail": "Invalid credentials"}


def test_list_and_get_video_jobs(tmp_path: Path):
    client, user_repo, video_repo = make_client(tmp_path)
    headers = make_auth_headers(user_repo.user_id)

    # Seed 2 jobs
    j1 = video_repo.create_job(None, uuid4(), user_repo.user_id, "first.mp4", "/path/1")
    j1.created_at = datetime.now(UTC) - timedelta(minutes=5)
    j2 = video_repo.create_job(None, uuid4(), user_repo.user_id, "second.mp4", "/path/2")
    j2.created_at = datetime.now(UTC)

    # List
    response = client.get(f"{API_PREFIX}/videos", headers=headers)
    assert response.status_code == 200
    items = response.json()
    assert len(items) == 2
    # Newest first
    assert items[0]["id"] == str(j2.id)
    assert items[1]["id"] == str(j1.id)

    # Get single
    get_res = client.get(f"{API_PREFIX}/videos/{j1.id}", headers=headers)
    assert get_res.status_code == 200
    assert get_res.json()["id"] == str(j1.id)
    assert get_res.json()["original_filename"] == "first.mp4"


def test_get_video_job_missing(tmp_path: Path):
    client, user_repo, _ = make_client(tmp_path)
    headers = make_auth_headers(user_repo.user_id)

    missing_uuid = uuid4()
    response = client.get(f"{API_PREFIX}/videos/{missing_uuid}", headers=headers)
    assert response.status_code == 404
    assert response.json() == {"detail": "Video job not found"}

    # Non-UUID returns 422
    bad_id = client.get(f"{API_PREFIX}/videos/not-a-uuid", headers=headers)
    assert bad_id.status_code == 422


def test_responses_never_expose_file_paths(tmp_path: Path):
    client, user_repo, video_repo = make_client(tmp_path)
    headers = make_auth_headers(user_repo.user_id)

    # Upload
    res = client.post(
        f"{API_PREFIX}/videos",
        headers=headers,
        files={"file": ("secret.mp4", BytesIO(b"abc"), "video/mp4")},
    )
    assert res.status_code == 201
    upload_json = res.json()
    assert "input_path" not in upload_json
    assert "output_path" not in upload_json

    # List
    list_res = client.get(f"{API_PREFIX}/videos", headers=headers)
    for item in list_res.json():
        assert "input_path" not in item
        assert "output_path" not in item

    # Get
    get_res = client.get(f"{API_PREFIX}/videos/{upload_json['id']}", headers=headers)
    assert "input_path" not in get_res.json()
    assert "output_path" not in get_res.json()
