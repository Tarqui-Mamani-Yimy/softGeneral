import sys
from types import SimpleNamespace

import pytest
from pwdlib import PasswordHash

from app.modules.users import create_admin


class FakeResult:
    def __init__(self, value=None):
        self.value = value

    def first(self):
        return self.value

    def scalar_one(self):
        return self.value


class FakeSession:
    def __init__(self, existing=None):
        self.existing = existing or set()
        self.inserted = None

    def __enter__(self):
        return self

    def __exit__(self, *args):
        return False

    def begin(self):
        return self

    def execute(self, query, params=None):
        sql = str(query)
        if sql.startswith("SELECT 1 FROM users"):
            duplicate = params["username"] in self.existing or params["email"] in self.existing
            return FakeResult((1,) if duplicate else None)
        if sql.startswith("SELECT id FROM roles"):
            return FakeResult(1)
        if sql.startswith("INSERT INTO users"):
            self.inserted = params
            return FakeResult()
        raise AssertionError(f"Unexpected SQL: {sql}")


def run_main(monkeypatch, session, password="Admin-password"):
    monkeypatch.setenv("ADMIN_PASSWORD", password)
    monkeypatch.setattr(create_admin, "Settings", lambda: SimpleNamespace(database_url="fake"))
    monkeypatch.setattr(create_admin, "build_engine", lambda _: "fake-engine")
    monkeypatch.setattr(create_admin, "build_session_factory", lambda _: lambda: session)
    monkeypatch.setattr(sys, "argv", ["create_admin", "--username", "admin", "--email", "admin@example.com", "--full-name", "First Admin"])
    create_admin.main()


def test_create_admin_uses_argon2_hash_from_environment(monkeypatch, capsys):
    session = FakeSession()

    run_main(monkeypatch, session)

    assert session.inserted["username"] == "admin"
    assert PasswordHash.recommended().verify("Admin-password", session.inserted["password_hash"])
    assert session.inserted["role_id"] == 1
    assert "Created admin user admin" in capsys.readouterr().out


@pytest.mark.parametrize("duplicate", [{"admin"}, {"admin@example.com"}])
def test_create_admin_rejects_duplicate_username_or_email(monkeypatch, duplicate):
    session = FakeSession(existing=duplicate)

    with pytest.raises(SystemExit) as error:
        run_main(monkeypatch, session)

    assert error.value.code == "A user with that username or email already exists"


def test_create_admin_rejects_mismatched_confirmation(monkeypatch):
    monkeypatch.delenv("ADMIN_PASSWORD", raising=False)
    monkeypatch.setattr(create_admin.getpass, "getpass", lambda prompt: "first" if "Confirm" not in prompt else "second")
    monkeypatch.setattr(sys, "argv", ["create_admin", "--username", "admin", "--email", "admin@example.com", "--full-name", "First Admin"])

    with pytest.raises(SystemExit) as error:
        create_admin.main()

    assert error.value.code == "Passwords do not match"
