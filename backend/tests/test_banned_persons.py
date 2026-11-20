from uuid import uuid4

import pytest
from fastapi.testclient import TestClient

from app.core.config import Settings
from app.main import API_PREFIX, create_app
from app.modules.auth.dependencies import get_user_repository
from app.modules.banned_persons.dependencies import get_banned_person_repository
from app.modules.banned_persons.repository import BannedPersonRecord
from tests.test_videos import FakeUserRepository, make_auth_headers

SECRET = "test-secret-with-at-least-32-bytes-long"


class FakeBannedPersonRepo:
    def __init__(self):
        self.items = {}

    def list_all(self, session, include_inactive=False):
        return [r for r in self.items.values() if include_inactive or r.is_active]

    def get_by_id(self, session, person_id):
        return self.items.get(person_id)

    def create(self, session, full_name, document_id, reason, severity, photo_path, face_encoding, notes, created_by):
        pid = uuid4()
        from datetime import datetime, UTC
        now = datetime.now(UTC)
        rec = BannedPersonRecord(
            id=pid,
            full_name=full_name,
            document_id=document_id,
            reason=reason,
            severity=severity,
            photo_path=photo_path,
            face_encoding=face_encoding,
            is_active=True,
            banned_at=now,
            notes=notes,
            created_by=created_by,
            created_at=now,
            updated_at=now,
        )
        self.items[pid] = rec
        return rec

    def update(self, session, person_id, **fields):
        rec = self.items.get(person_id)
        if not rec:
            return None
        for k, v in fields.items():
            if v is not None:
                setattr(rec, k, v)
        return rec

    def delete(self, session, person_id):
        return bool(self.items.pop(person_id, None))


def test_list_and_delete_banned_persons(tmp_path):
    repo = FakeBannedPersonRepo()
    user_repo = FakeUserRepository(permissions=["banned_persons.read", "banned_persons.manage"])
    app = create_app(Settings(jwt_secret=SECRET, storage_dir=str(tmp_path)))
    app.dependency_overrides[get_banned_person_repository] = lambda: repo
    app.dependency_overrides[get_user_repository] = lambda: user_repo

    client = TestClient(app)
    headers = make_auth_headers(user_repo.user_id)

    res = client.get(f"{API_PREFIX}/banned-persons", headers=headers)
    assert res.status_code == 200
    assert res.json() == []

    # Insert fake record
    rec = repo.create(None, "Juan Perez", "12345", "Violencia", "high", "banned_persons/p1.jpg", [0.1] * 128, None, None)
    res = client.get(f"{API_PREFIX}/banned-persons", headers=headers)
    assert res.status_code == 200
    assert len(res.json()) == 1
    assert res.json()[0]["full_name"] == "Juan Perez"

    # Delete
    res = client.delete(f"{API_PREFIX}/banned-persons/{rec.id}", headers=headers)
    assert res.status_code == 204
    assert len(repo.list_all(None)) == 0
