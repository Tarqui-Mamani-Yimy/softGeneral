from uuid import uuid4
import pytest
from sqlalchemy import text
from app.modules.users.repository import UsersRepository


def test_users_repository_crud():
    from app.core.config import Settings
    from app.core.database import build_engine, build_session_factory

    settings = Settings()
    engine = build_engine(settings.database_url)
    session_factory = build_session_factory(engine)
    repo = UsersRepository()

    test_username = f"test_{uuid4().hex[:8]}"
    test_email = f"{test_username}@example.com"

    with session_factory() as session:
        roles = repo.list_roles(session)
        assert len(roles) >= 2
        role_codes = {r["code"] for r in roles}
        assert "admin" in role_codes
        assert "guard" in role_codes

        user_id = repo.create(
            session,
            username=test_username,
            email=test_email,
            full_name="Usuario de Prueba",
            plain_password="password123",
            role_code="guard",
            is_active=True,
        )
        assert user_id is not None

    with session_factory() as session:
        user = repo.get_by_id(session, user_id)
        assert user is not None
        assert user["username"] == test_username
        assert user["role"] == "guard"
        assert user["is_active"] is True

        # Update
        updated = repo.update(
            session,
            user_id,
            full_name="Usuario Modificado",
            is_active=False,
            role_code="admin",
        )
        assert updated is not None
        assert updated["full_name"] == "Usuario Modificado"
        assert updated["is_active"] is False
        assert updated["role"] == "admin"

        # List
        users = repo.list_users(session, search=test_username)
        assert len(users) == 1
        assert users[0]["id"] == user_id

        # Delete
        deleted = repo.delete(session, user_id)
        assert deleted is True

        assert repo.get_by_id(session, user_id) is None
