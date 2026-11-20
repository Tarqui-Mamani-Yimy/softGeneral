from datetime import UTC, datetime
from pathlib import Path
from uuid import uuid4

from tests.test_videos import FakeUserRepository, make_auth_headers, make_client
from app.modules.videos.repository import VideoJobRecord


def record(job_id, status, output_path=None):
    return VideoJobRecord(
        id=job_id,
        uploaded_by=None,
        original_filename="clip.mp4",
        input_path="/input/clip.mp4",
        output_path=output_path,
        status=status,
        progress=100.0 if status == "completed" else 0.0,
        created_at=datetime.now(UTC),
    )


def test_completed_video_output_is_streamed(tmp_path: Path):
    client, user, repository = make_client(tmp_path)
    job_id = uuid4()
    output = tmp_path / "outputs" / f"{job_id}.mp4"
    output.parent.mkdir()
    output.write_bytes(b"mp4 data")
    repository.jobs[job_id] = record(job_id, "completed", str(output))

    response = client.get(f"/api/v1/videos/{job_id}/output", headers=make_auth_headers(user.user_id))

    assert response.status_code == 200
    assert response.headers["content-type"] == "video/mp4"
    assert response.content == b"mp4 data"


def test_video_output_not_ready_returns_409(tmp_path: Path):
    client, user, repository = make_client(tmp_path)
    job_id = uuid4()
    repository.jobs[job_id] = record(job_id, "processing")

    response = client.get(f"/api/v1/videos/{job_id}/output", headers=make_auth_headers(user.user_id))

    assert response.status_code == 409
    assert response.json() == {"detail": "Video is not ready"}


def test_video_output_missing_or_outside_storage_returns_404(tmp_path: Path):
    client, user, repository = make_client(tmp_path)
    missing_id = uuid4()
    repository.jobs[missing_id] = record(missing_id, "completed", str(tmp_path / "outputs" / "missing.mp4"))
    outside_id = uuid4()
    outside = tmp_path.parent / "outside.mp4"
    outside.write_bytes(b"secret")
    repository.jobs[outside_id] = record(outside_id, "completed", str(outside))

    missing = client.get(f"/api/v1/videos/{missing_id}/output", headers=make_auth_headers(user.user_id))
    outside_response = client.get(f"/api/v1/videos/{outside_id}/output", headers=make_auth_headers(user.user_id))

    assert missing.status_code == 404
    assert outside_response.status_code == 404
    outside.unlink()


def test_video_output_requires_read_permission(tmp_path: Path):
    user_repository = FakeUserRepository(permissions={"videos.upload"})
    client, user, repository = make_client(tmp_path, user_repository=user_repository)
    job_id = uuid4()
    repository.jobs[job_id] = record(job_id, "completed", str(tmp_path / "video.mp4"))

    response = client.get(f"/api/v1/videos/{job_id}/output", headers=make_auth_headers(user.user_id))

    assert response.status_code == 403
