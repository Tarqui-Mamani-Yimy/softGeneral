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


@pytest.mark.integration
def test_alert_review_updates_db_and_audit_log(tmp_path: Path):
    database_url = os.getenv("TEST_DATABASE_URL")
    if not database_url:
        pytest.skip("TEST_DATABASE_URL is not set")

    engine = create_engine(database_url)
    password = "integration-password"

    with engine.connect() as connection:
        transaction = connection.begin()
        try:
            # Guard has alerts.read and alerts.review
            role_id = connection.execute(text("SELECT id FROM roles WHERE code = 'guard'")).scalar_one()
            user_id = connection.execute(
                text("""INSERT INTO users (username, email, full_name, password_hash, role_id)
                        VALUES ('integration_alert_guard', 'alert_guard@example.com', 'Alert Guard', :hash, :role_id)
                        RETURNING id"""),
                {"hash": PasswordHash.recommended().hash(password), "role_id": role_id},
            ).scalar_one()

            # Insert job
            job_id = connection.execute(
                text("""INSERT INTO video_jobs (uploaded_by, original_filename, input_path, status)
                        VALUES (:uid, 'test_match.mp4', '/tmp/match.mp4', 'completed')
                        RETURNING id"""),
                {"uid": user_id},
            ).scalar_one()

            # Insert pending alert
            alert_id = connection.execute(
                text("""INSERT INTO alerts (alert_type, video_job_id, occurred_at, confidence, status)
                        VALUES ('intrusion', :job_id, now(), 0.95, 'pending')
                        RETURNING id"""),
                {"job_id": job_id},
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

            # Login to get token
            login_res = client.post(
                f"{API_PREFIX}/auth/login",
                json={"username": "integration_alert_guard", "password": password},
            )
            assert login_res.status_code == 200
            token = login_res.json()["access_token"]
            headers = {"Authorization": f"Bearer {token}"}

            # Review alert
            review_res = client.post(
                f"{API_PREFIX}/alerts/{alert_id}/review",
                headers=headers,
                json={"status": "confirmed", "notes": "Pitch invader verified on tape"},
            )
            assert review_res.status_code == 200
            body = review_res.json()
            assert body["status"] == "confirmed"
            assert body["reviewed_by"] == str(user_id)
            assert body["review_notes"] == "Pitch invader verified on tape"
            assert body["reviewed_at"] is not None

            # Verify in database
            alert_row = connection.execute(
                text("SELECT status, reviewed_by, review_notes FROM alerts WHERE id = :id"),
                {"id": alert_id},
            ).mappings().one()
            assert alert_row["status"] == "confirmed"
            assert alert_row["reviewed_by"] == user_id
            assert alert_row["review_notes"] == "Pitch invader verified on tape"

            # Verify audit log in database
            audit_count = connection.execute(
                text("""SELECT count(*) FROM audit_log
                        WHERE user_id = :uid AND action = 'alert.confirmed' AND entity_type = 'alert' AND entity_id = :aid"""),
                {"uid": user_id, "aid": str(alert_id)},
            ).scalar_one()
            assert audit_count == 1

            # Second review returns 409
            second_res = client.post(
                f"{API_PREFIX}/alerts/{alert_id}/review",
                headers=headers,
                json={"status": "false_alarm"},
            )
            assert second_res.status_code == 409
            assert second_res.json() == {"detail": "Alert already reviewed"}

        finally:
            transaction.rollback()
