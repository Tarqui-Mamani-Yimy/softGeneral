from io import BytesIO
import os
from pathlib import Path
from uuid import UUID

import pytest
from fastapi.testclient import TestClient
from pwdlib import PasswordHash
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker

from app.core.config import Settings
from app.main import API_PREFIX, create_app
from app.modules.auth.repository import UserRepository


@pytest.mark.integration
def test_video_upload_persists_job_and_audit_log(tmp_path: Path):
    database_url = os.getenv("TEST_DATABASE_URL")
    if not database_url:
        pytest.skip("TEST_DATABASE_URL is not set")

    engine = create_engine(database_url)
    password = "integration-password"

    with engine.connect() as connection:
        transaction = connection.begin()
        try:
            # Pick guard role which has 'videos.upload' and 'videos.read'
            role_id = connection.execute(text("SELECT id FROM roles WHERE code = 'guard'")).scalar_one()
            user_id = connection.execute(
                text("""INSERT INTO users (username, email, full_name, password_hash, role_id)
                        VALUES (:username, :email, :full_name, :password_hash, :role_id)
                        RETURNING id"""),
                {
                    "username": "integration_video_guard",
                    "email": "video_guard@example.com",
                    "full_name": "Integration Video Guard",
                    "password_hash": PasswordHash.recommended().hash(password),
                    "role_id": role_id,
                },
            ).scalar_one()

            jwt_secret = "integration-secret-with-at-least-32-bytes"
            settings = Settings(
                database_url=database_url,
                jwt_secret=jwt_secret,
                storage_dir=str(tmp_path),
            )
            app = create_app(settings)
            connection.begin_nested()
            app.state.session_factory = sessionmaker(bind=connection, autoflush=False, expire_on_commit=False)
            client = TestClient(app)

            # Login to get token
            login_res = client.post(
                f"{API_PREFIX}/auth/login",
                json={"username": "integration_video_guard", "password": password},
            )
            assert login_res.status_code == 200
            token = login_res.json()["access_token"]
            headers = {"Authorization": f"Bearer {token}"}

            # Upload video
            fake_video_content = b"fake video bytes for integration test"
            upload_res = client.post(
                f"{API_PREFIX}/videos",
                headers=headers,
                files={"file": ("field_camera.mp4", BytesIO(fake_video_content), "video/mp4")},
            )
            assert upload_res.status_code == 201
            body = upload_res.json()
            job_id = UUID(body["id"])
            assert body["original_filename"] == "field_camera.mp4"
            assert body["status"] == "queued"
            assert body["progress"] == 0.0

            # Verify video_jobs row
            job_row = connection.execute(
                text("""SELECT id, uploaded_by, original_filename, input_path, status, progress
                        FROM video_jobs WHERE id = :id"""),
                {"id": job_id},
            ).mappings().one_or_none()

            assert job_row is not None
            assert job_row["uploaded_by"] == user_id
            assert job_row["original_filename"] == "field_camera.mp4"
            assert job_row["status"] == "queued"
            assert float(job_row["progress"]) == 0.0
            assert str(job_id) in job_row["input_path"]
            assert "field_camera" not in job_row["input_path"]

            # Verify audit_log row
            audit_count = connection.execute(
                text("""SELECT count(*) FROM audit_log
                        WHERE user_id = :user_id AND action = 'video.uploaded' AND entity_id = :job_id"""),
                {"user_id": user_id, "job_id": str(job_id)},
            ).scalar_one()
            assert audit_count == 1

            # List via API
            list_res = client.get(f"{API_PREFIX}/videos", headers=headers)
            assert list_res.status_code == 200
            assert any(item["id"] == str(job_id) for item in list_res.json())

            # Get via API
            get_res = client.get(f"{API_PREFIX}/videos/{job_id}", headers=headers)
            assert get_res.status_code == 200
            assert get_res.json()["id"] == str(job_id)

        finally:
            transaction.rollback()
