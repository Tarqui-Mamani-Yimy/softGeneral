from datetime import UTC, datetime, timedelta
from uuid import UUID, uuid4

import jwt
from fastapi import Depends
from fastapi.testclient import TestClient
from pwdlib import PasswordHash

from app.core.config import Settings
from app.main import API_PREFIX, create_app
from app.modules.auth.dependencies import get_user_repository, require_permission
from app.modules.auth.repository import UserRecord


PASSWORD_HASH = PasswordHash.recommended()
SECRET = "test-secret-with-at-least-32-bytes-long"


class FakeUserRepository:
    def __init__(self):
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
        self.permission_codes = {"alerts.read"}
        self.login_updates = 0
        self.audit_entries = 0

    def find_by_identifier(self, session, identifier):
        if identifier.lower() in {self.user.username, self.user.email}:
            return self.user
        return None

    def get_by_id(self, session, user_id):
        return self.user if user_id == self.user.id else None

    def get_permissions(self, session, user_id):
        return sorted(self.permission_codes) if user_id == self.user.id and self.user.is_active else []

    def mark_login(self, session, user_id):
        self.login_updates += 1

    def add_login_audit(self, session, user_id):
        self.audit_entries += 1


def make_client(repository=None):
    repository = repository or FakeUserRepository()
    app = create_app(Settings(database_url="postgresql+psycopg://user:pass@127.0.0.1:1/none", jwt_secret=SECRET))
    app.dependency_overrides[get_user_repository] = lambda: repository
    return TestClient(app), repository


def test_login_returns_token_user_and_permissions():
    client, repository = make_client()

    response = client.post(f"{API_PREFIX}/auth/login", json={"username": "guard", "password": repository.password})

    assert response.status_code == 200
    body = response.json()
    assert body["user"] == {
        "id": str(repository.user_id),
        "username": "guard",
        "full_name": "Test Guard",
        "role": "guard",
        "permissions": ["alerts.read"],
    }
    assert body["access_token"]
    assert body["token_type"] == "bearer"
    assert repository.login_updates == 1
    assert repository.audit_entries == 1


def test_wrong_unknown_and_inactive_credentials_have_same_401_body():
    client, repository = make_client()
    wrong = client.post(f"{API_PREFIX}/auth/login", json={"username": "guard", "password": "wrong"})
    unknown = client.post(f"{API_PREFIX}/auth/login", json={"username": "missing", "password": "wrong"})
    repository.user.is_active = False
    inactive = client.post(f"{API_PREFIX}/auth/login", json={"email": repository.user.email, "password": repository.password})

    assert [response.status_code for response in (wrong, unknown, inactive)] == [401, 401, 401]
    assert {response.text for response in (wrong, unknown, inactive)} == {'{"detail":"Invalid credentials"}'}


def test_me_requires_valid_nonexpired_token():
    client, repository = make_client()
    login = client.post(f"{API_PREFIX}/auth/login", json={"email": repository.user.email, "password": repository.password})
    token = login.json()["access_token"]

    assert client.get(f"{API_PREFIX}/auth/me").status_code == 401
    assert client.get(f"{API_PREFIX}/auth/me", headers={"Authorization": f"Bearer {token}tampered"}).status_code == 401
    expired = jwt.encode({"sub": str(repository.user_id), "iat": datetime.now(UTC) - timedelta(minutes=2), "exp": datetime.now(UTC) - timedelta(minutes=1)}, SECRET, algorithm="HS256")
    assert client.get(f"{API_PREFIX}/auth/me", headers={"Authorization": f"Bearer {expired}"}).status_code == 401


def test_me_returns_current_user_and_permissions_and_deactivation_takes_effect():
    client, repository = make_client()
    login = client.post(f"{API_PREFIX}/auth/login", json={"username": "guard", "password": repository.password})
    headers = {"Authorization": f"Bearer {login.json()['access_token']}"}

    response = client.get(f"{API_PREFIX}/auth/me", headers=headers)
    assert response.status_code == 200
    assert response.json()["permissions"] == ["alerts.read"]
    repository.user.is_active = False
    assert client.get(f"{API_PREFIX}/auth/me", headers=headers).status_code == 401


def test_require_permission_returns_403_or_allows_request():
    client, repository = make_client()
    app = client.app

    @app.get("/permission-test")
    def permission_test(user=Depends(require_permission("alerts.review"))):
        return {"ok": True}

    login = client.post(f"{API_PREFIX}/auth/login", json={"username": "guard", "password": repository.password})
    headers = {"Authorization": f"Bearer {login.json()['access_token']}"}
    assert client.get("/permission-test", headers=headers).status_code == 403
    repository.permission_codes.add("alerts.review")
    assert client.get("/permission-test", headers=headers).json() == {"ok": True}
