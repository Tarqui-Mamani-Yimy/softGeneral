from dataclasses import dataclass
from uuid import UUID

from sqlalchemy import text
from sqlalchemy.orm import Session


@dataclass
class UserRecord:
    id: UUID
    username: str
    email: str
    full_name: str
    role: str
    password_hash: str
    is_active: bool


class UserRepository:
    def find_by_identifier(self, session: Session, identifier: str) -> UserRecord | None:
        row = session.execute(
            text("""SELECT u.id, u.username, u.email, u.full_name, u.password_hash,
                         u.is_active, r.code AS role
                  FROM users u JOIN roles r ON r.id = u.role_id
                  WHERE u.username = :identifier OR u.email = :identifier"""),
            {"identifier": identifier},
        ).mappings().one_or_none()
        return self._record(row)

    def get_by_id(self, session: Session, user_id: UUID) -> UserRecord | None:
        row = session.execute(
            text("""SELECT u.id, u.username, u.email, u.full_name, u.password_hash,
                         u.is_active, r.code AS role
                  FROM users u JOIN roles r ON r.id = u.role_id
                  WHERE u.id = :user_id"""),
            {"user_id": user_id},
        ).mappings().one_or_none()
        return self._record(row)

    def get_permissions(self, session: Session, user_id: UUID) -> list[str]:
        rows = session.execute(
            text("SELECT permission_code FROM user_permissions WHERE user_id = :user_id ORDER BY permission_code"),
            {"user_id": user_id},
        )
        return [row[0] for row in rows]

    def mark_login(self, session: Session, user_id: UUID) -> None:
        session.execute(
            text("UPDATE users SET last_login_at = now() WHERE id = :user_id"),
            {"user_id": user_id},
        )

    def add_login_audit(self, session: Session, user_id: UUID) -> None:
        session.execute(
            text("""INSERT INTO audit_log (user_id, action, entity_type, entity_id, details)
                   VALUES (:user_id, 'user.login', 'user', :entity_id, '{}'::jsonb)"""),
            {"user_id": user_id, "entity_id": str(user_id)},
        )

    @staticmethod
    def _record(row) -> UserRecord | None:
        if row is None:
            return None
        return UserRecord(**row)
