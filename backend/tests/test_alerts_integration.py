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


@pytest.mark.integration
def test_alert_notify_on_commit_and_none_on_rollback():
    database_url = os.getenv("TEST_DATABASE_URL")
    if not database_url:
        pytest.skip("TEST_DATABASE_URL is not set")

    import json
    from datetime import datetime, timezone
    from uuid import uuid4
    import psycopg
    from sqlalchemy.orm import Session
    from app.modules.alerts.repository import AlertRepository

    raw_conninfo = database_url.replace("postgresql+psycopg://", "postgresql://")
    listener_conn = psycopg.connect(raw_conninfo, autocommit=True)
    listener_conn.execute("LISTEN alerts")

    engine = create_engine(database_url)
    repo = AlertRepository()

    created_user_id = None
    created_job_id = None
    created_alert_id = None

    test_uname = f"notify_user_{uuid4().hex[:8]}"
    test_email = f"{test_uname}@example.com"

    try:
        with engine.connect() as conn:
            role_id = conn.execute(text("SELECT id FROM roles WHERE code = 'guard'")).scalar_one()
            created_user_id = conn.execute(
                text("""INSERT INTO users (username, email, full_name, password_hash, role_id)
                        VALUES (:uname, :email, 'Notify Tester', 'hash', :role_id)
                        RETURNING id"""),
                {"uname": test_uname, "email": test_email, "role_id": role_id},
            ).scalar_one()
            created_job_id = conn.execute(
                text("""INSERT INTO video_jobs (uploaded_by, original_filename, input_path, status)
                        VALUES (:uid, 'notify_test.mp4', '/tmp/notify.mp4', 'completed')
                        RETURNING id"""),
                {"uid": created_user_id},
            ).scalar_one()
            conn.commit()

        # 1. Committed insert produces a NOTIFY payload
        created_alert_id = uuid4()
        with Session(engine) as session:
            repo.create_alert(
                session,
                id=created_alert_id,
                alert_type="intrusion",
                video_job_id=created_job_id,
                occurred_at=datetime.now(timezone.utc),
                confidence=0.92,
                track_id=1,
                snapshot_path=None,
                clip_path=None,
                details={"zone": "gate"},
            )
            session.commit()

        generator = listener_conn.notifies(timeout=2.0)
        notify = next(generator, None)
        generator.close()
        assert notify is not None, "Expected NOTIFY payload on commit, got none"
        assert notify.channel == "alerts"
        payload = json.loads(notify.payload)
        assert payload["id"] == str(created_alert_id)
        assert payload["alert_type"] == "intrusion"

        # 2. Rolled-back insert produces NO notify
        rolled_back_id = uuid4()
        with Session(engine) as session:
            repo.create_alert(
                session,
                id=rolled_back_id,
                alert_type="weapon",
                video_job_id=created_job_id,
                occurred_at=datetime.now(timezone.utc),
                confidence=0.88,
                track_id=2,
                snapshot_path=None,
                clip_path=None,
                details={"zone": "lobby"},
            )
            session.rollback()

        generator_empty = listener_conn.notifies(timeout=0.5)
        notify_empty = next(generator_empty, None)
        generator_empty.close()
        assert notify_empty is None, "Did not expect NOTIFY payload on rollback"

    finally:
        listener_conn.close()
        with engine.connect() as conn:
            if created_alert_id:
                conn.execute(text("DELETE FROM alerts WHERE id = :id"), {"id": created_alert_id})
            if created_job_id:
                conn.execute(text("DELETE FROM video_jobs WHERE id = :id"), {"id": created_job_id})
            if created_user_id:
                conn.execute(text("DELETE FROM users WHERE id = :id"), {"id": created_user_id})
            conn.commit()

