import os
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from pwdlib import PasswordHash
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker

from app.core.config import Settings
from app.main import API_PREFIX, create_app
from live.supervisor import WatchRepository


def _database_url() -> str:
    database_url = os.getenv("TEST_DATABASE_URL")
    if not database_url:
        pytest.skip("TEST_DATABASE_URL is not set")
    return database_url


@pytest.mark.integration
def test_demo_session_writes_camera_and_audit_rows(tmp_path: Path):
    database_url = _database_url()
    engine = create_engine(database_url)
    password = "admin-integration-password"

    with engine.connect() as connection:
        transaction = connection.begin()
        try:
            role_id = connection.execute(text("SELECT id FROM roles WHERE code = 'admin'")).scalar_one()
            user_id = connection.execute(
                text("""INSERT INTO users (username, email, full_name, password_hash, role_id)
                        VALUES ('integration_demo_admin', 'demo_admin@example.com', 'Demo Admin', :hash, :role_id)
                        RETURNING id"""),
                {"hash": PasswordHash.recommended().hash(password), "role_id": role_id},
            ).scalar_one()
            app = create_app(Settings(database_url=database_url, jwt_secret="integration-secret-with-at-least-32-bytes", storage_dir=str(tmp_path)))
            connection.begin_nested()
            app.state.session_factory = sessionmaker(bind=connection, autoflush=False, expire_on_commit=False)
            client = TestClient(app)
            token = client.post(f"{API_PREFIX}/auth/login", json={"username": "integration_demo_admin", "password": password}).json()["access_token"]
            headers = {"Authorization": f"Bearer {token}"}

            created = client.post(f"{API_PREFIX}/demo/sessions", headers=headers)
            assert created.status_code == 201
            body = created.json()
            assert "source_url" not in body

            row = connection.execute(
                text("SELECT code, name, source_type, source_url, is_active FROM cameras WHERE id = :id"),
                {"id": body["id"]},
            ).mappings().one()
            assert row["code"] == body["camera_code"] and row["code"].startswith("demo_")
            assert row["source_type"] == "rtsp" and row["source_url"].endswith(f"/{row['code']}")
            assert row["is_active"] is True
            audit = connection.execute(
                text("SELECT user_id FROM audit_log WHERE action = 'camera.created' AND entity_id = :id"),
                {"id": body["id"]},
            ).mappings().one()
            assert audit["user_id"] == user_id

            current = client.get(f"{API_PREFIX}/demo/sessions/current", headers=headers)
            assert current.status_code == 200 and current.json()["id"] == body["id"]

            assert client.delete(f"{API_PREFIX}/demo/sessions/{body['id']}", headers=headers).status_code == 204
            assert connection.execute(text("SELECT is_active FROM cameras WHERE id = :id"), {"id": body["id"]}).scalar_one() is False
            assert connection.execute(
                text("SELECT count(*) FROM audit_log WHERE action = 'camera.disabled' AND entity_id = :id AND user_id = :uid"),
                {"id": body["id"], "uid": user_id},
            ).scalar_one() == 1
            assert client.get(f"{API_PREFIX}/demo/sessions/current", headers=headers).status_code == 404
        finally:
            transaction.rollback()


@pytest.mark.integration
def test_watch_repository_expires_only_demo_cameras_with_system_audit():
    engine = create_engine(_database_url())
    with engine.connect() as connection:
        transaction = connection.begin()
        try:
            ids = {}
            for code in ("demo_aaaa1111", "cam_regular_it"):
                ids[code] = str(connection.execute(
                    text("""INSERT INTO cameras (code, name, location, source_type, source_url)
                            VALUES (:code, 'x', '', 'rtsp', 'rtsp://127.0.0.1:8554/x') RETURNING id"""),
                    {"code": code},
                ).scalar_one())
            connection.begin_nested()
            session = sessionmaker(bind=connection, autoflush=False, expire_on_commit=False)()
            repository = WatchRepository()
            assert {c.code for c in repository.list_watchable(session)} == set(ids)

            assert repository.expire_demo(session, ids["demo_aaaa1111"]) is True
            assert repository.expire_demo(session, ids["cam_regular_it"]) is False
            active = {c.code for c in repository.list_watchable(session)}
            assert active == {"cam_regular_it"}
            audit = connection.execute(
                text("SELECT user_id, details->>'reason' AS reason FROM audit_log WHERE action = 'camera.disabled' AND entity_id = :id"),
                {"id": ids["demo_aaaa1111"]},
            ).mappings().one()
            assert audit["user_id"] is None and audit["reason"] == "demo_expired"
        finally:
            transaction.rollback()
