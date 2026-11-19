import os
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from pwdlib import PasswordHash
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker

from app.core.config import Settings
from app.main import API_PREFIX, create_app


@pytest.mark.integration
def test_create_camera_writes_db_and_audit_log(tmp_path: Path):
    database_url = os.getenv("TEST_DATABASE_URL")
    if not database_url:
        pytest.skip("TEST_DATABASE_URL is not set")

    engine = create_engine(database_url)
    password = "admin-integration-password"

    with engine.connect() as connection:
        transaction = connection.begin()
        try:
            # Admin has cameras.manage and cameras.read
            role_id = connection.execute(text("SELECT id FROM roles WHERE code = 'admin'")).scalar_one()
            user_id = connection.execute(
                text("""INSERT INTO users (username, email, full_name, password_hash, role_id)
                        VALUES ('integration_camera_admin', 'cam_admin@example.com', 'Camera Admin', :hash, :role_id)
                        RETURNING id"""),
                {"hash": PasswordHash.recommended().hash(password), "role_id": role_id},
            ).scalar_one()

            settings = Settings(
                database_url=database_url,
                jwt_secret="integration-secret-with-at-least-32-bytes",
                storage_dir=str(tmp_path),
            )
            app = create_app(settings)
            connection.begin_nested()
            app.state.session_factory = sessionmaker(bind=connection, autoflush=False, expire_on_commit=False)
            client = TestClient(app)

            # Login to get JWT
            login_res = client.post(
                f"{API_PREFIX}/auth/login",
                json={"username": "integration_camera_admin", "password": password},
            )
            assert login_res.status_code == 200
            token = login_res.json()["access_token"]
            headers = {"Authorization": f"Bearer {token}"}

            # Create Camera via API
            create_res = client.post(
                f"{API_PREFIX}/cameras",
                headers=headers,
                json={
                    "code": "cam_int_test_01",
                    "name": "Integration Camera",
                    "location": "North Stand",
                    "source_type": "rtsp",
                    "source_url": "rtsp://127.0.0.1:8554/cam_int_test_01",
                },
            )
            assert create_res.status_code == 201
            body = create_res.json()
            camera_id = body["id"]
            assert body["code"] == "cam_int_test_01"
            assert body["live_path"] == "cam_int_test_01_annotated"
            assert body["source_url"] == "rtsp://127.0.0.1:8554/cam_int_test_01"

            # Check DB row in cameras
            camera_row = connection.execute(
                text("SELECT code, name, location, source_type, source_url, is_active FROM cameras WHERE id = :id"),
                {"id": camera_id},
            ).mappings().one()
            assert camera_row["code"] == "cam_int_test_01"
            assert camera_row["name"] == "Integration Camera"
            assert camera_row["source_type"] == "rtsp"
            assert camera_row["source_url"] == "rtsp://127.0.0.1:8554/cam_int_test_01"
            assert camera_row["is_active"] is True

            # Check audit_log row in DB
            audit_row = connection.execute(
                text("""SELECT user_id, action, entity_type, entity_id FROM audit_log
                        WHERE action = 'camera.created' AND entity_id = :id"""),
                {"id": str(camera_id)},
            ).mappings().one()
            assert audit_row["user_id"] == user_id
            assert audit_row["action"] == "camera.created"
            assert audit_row["entity_type"] == "camera"

        finally:
            transaction.rollback()


@pytest.mark.integration
def test_camera_audit_log_never_stores_stream_credentials(tmp_path: Path):
    database_url = os.getenv("TEST_DATABASE_URL")
    if not database_url:
        pytest.skip("TEST_DATABASE_URL is not set")

    engine = create_engine(database_url)
    password = "admin-integration-password"
    with engine.connect() as connection:
        transaction = connection.begin()
        try:
            role_id = connection.execute(text("SELECT id FROM roles WHERE code = 'admin'")).scalar_one()
            connection.execute(
                text("""INSERT INTO users (username, email, full_name, password_hash, role_id)
                        VALUES ('integration_cred_admin', 'cred_admin@example.com', 'Cred Admin', :hash, :role_id)"""),
                {"hash": PasswordHash.recommended().hash(password), "role_id": role_id},
            )
            app = create_app(Settings(database_url=database_url, jwt_secret="integration-secret-with-at-least-32-bytes", storage_dir=str(tmp_path)))
            connection.begin_nested()
            app.state.session_factory = sessionmaker(bind=connection, autoflush=False, expire_on_commit=False)
            client = TestClient(app)
            token = client.post(f"{API_PREFIX}/auth/login", json={"username": "integration_cred_admin", "password": password}).json()["access_token"]
            headers = {"Authorization": f"Bearer {token}"}

            created = client.post(f"{API_PREFIX}/cameras", headers=headers, json={
                "code": "cam_cred_01", "name": "Cred Camera", "source_type": "rtsp",
                "source_url": "rtsp://viewer:first-secret@10.0.0.5:554/stream1",
            })
            assert created.status_code == 201
            updated = client.patch(f"{API_PREFIX}/cameras/{created.json()['id']}", headers=headers, json={
                "source_url": "rtsp://viewer:second-secret@10.0.0.6:554/stream1",
            })
            assert updated.status_code == 200

            details = connection.execute(
                text("SELECT details::text FROM audit_log WHERE entity_type = 'camera' AND entity_id = :id ORDER BY id"),
                {"id": created.json()["id"]},
            ).scalars().all()
            assert len(details) == 2
            assert not any("secret" in row or "viewer:" in row for row in details)
            assert "10.0.0.6" in details[1]  # the change itself is still traceable
        finally:
            transaction.rollback()
