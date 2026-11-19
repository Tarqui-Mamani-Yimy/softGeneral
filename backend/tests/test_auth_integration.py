import os

import pytest
from fastapi.testclient import TestClient
from pwdlib import PasswordHash
from sqlalchemy import text
from sqlalchemy.orm import sessionmaker

from app.core.config import Settings
from app.main import API_PREFIX, create_app


@pytest.mark.integration
def test_login_updates_last_login_and_audit_log():
    database_url = os.getenv("TEST_DATABASE_URL")
    if not database_url:
        pytest.skip("TEST_DATABASE_URL is not set")

    from sqlalchemy import create_engine

    engine = create_engine(database_url)
    user_id = None
    password = "integration-password"
    with engine.connect() as connection:
        transaction = connection.begin()
        try:
            role_id = connection.execute(text("SELECT id FROM roles WHERE code = 'guard'")).scalar_one()
            user_id = connection.execute(
                text("""INSERT INTO users (username, email, full_name, password_hash, role_id)
                        VALUES (:username, :email, :full_name, :password_hash, :role_id)
                        RETURNING id"""),
                {
                    "username": "integration_guard",
                    "email": "integration_guard@example.com",
                    "full_name": "Integration Guard",
                    "password_hash": PasswordHash.recommended().hash(password),
                    "role_id": role_id,
                },
            ).scalar_one()
            settings = Settings(database_url=database_url, jwt_secret="integration-secret-with-at-least-32-bytes")
            app = create_app(settings)
            connection.begin_nested()
            app.state.session_factory = sessionmaker(bind=connection, autoflush=False, expire_on_commit=False)
            client = TestClient(app)
            response = client.post(f"{API_PREFIX}/auth/login", json={"username": "integration_guard", "password": password})
            assert response.status_code == 200
            assert client.get(f"{API_PREFIX}/auth/me", headers={"Authorization": f"Bearer {response.json()['access_token']}"}).status_code == 200
            assert connection.execute(text("SELECT last_login_at IS NOT NULL FROM users WHERE id = :id"), {"id": user_id}).scalar_one()
            assert connection.execute(text("SELECT count(*) FROM audit_log WHERE user_id = :id AND action = 'user.login'"), {"id": user_id}).scalar_one() == 1
        finally:
            transaction.rollback()
