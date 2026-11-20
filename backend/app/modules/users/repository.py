from datetime import datetime
from uuid import UUID

from pwdlib import PasswordHash
from sqlalchemy import text
from sqlalchemy.orm import Session

password_hash = PasswordHash.recommended()


class UsersRepository:
    def list_roles(self, session: Session) -> list[dict]:
        rows = session.execute(
            text("SELECT id, code, name, description FROM roles ORDER BY id")
        ).mappings().all()
        return [dict(r) for r in rows]

    def list_users(
        self,
        session: Session,
        search: str | None = None,
        role: str | None = None,
        is_active: bool | None = None,
    ) -> list[dict]:
        conditions = []
        params = {}

        if search:
            conditions.append(
                "(u.username ILIKE :search OR u.email ILIKE :search OR u.full_name ILIKE :search)"
            )
            params["search"] = f"%{search}%"
        if role:
            conditions.append("r.code = :role")
            params["role"] = role
        if is_active is not None:
            conditions.append("u.is_active = :is_active")
            params["is_active"] = is_active

        where_clause = f"WHERE {' AND '.join(conditions)}" if conditions else ""
        query = f"""
            SELECT u.id, u.username, u.email, u.full_name, r.code AS role,
                   r.name AS role_name, u.is_active, u.last_login_at, u.created_at
            FROM users u
            JOIN roles r ON r.id = u.role_id
            {where_clause}
            ORDER BY u.created_at DESC
        """
        rows = session.execute(text(query), params).mappings().all()
        return [dict(r) for r in rows]

    def get_by_id(self, session: Session, user_id: UUID) -> dict | None:
        row = session.execute(
            text("""SELECT u.id, u.username, u.email, u.full_name, r.code AS role,
                           r.name AS role_name, u.is_active, u.last_login_at, u.created_at
                    FROM users u
                    JOIN roles r ON r.id = u.role_id
                    WHERE u.id = :id"""),
            {"id": user_id},
        ).mappings().one_or_none()
        return dict(row) if row else None

    def exists_by_username_or_email(self, session: Session, username: str, email: str, exclude_id: UUID | None = None) -> bool:
        cond = "AND id != :exclude_id" if exclude_id else ""
        params = {"username": username, "email": email}
        if exclude_id:
            params["exclude_id"] = exclude_id
        row = session.execute(
            text(f"SELECT 1 FROM users WHERE (username = :username OR email = :email) {cond}"),
            params,
        ).first()
        return row is not None

    def create(
        self,
        session: Session,
        username: str,
        email: str,
        full_name: str,
        plain_password: str,
        role_code: str,
        is_active: bool = True,
    ) -> UUID:
        role_id = session.execute(
            text("SELECT id FROM roles WHERE code = :code"),
            {"code": role_code},
        ).scalar_one_or_none()
        if role_id is None:
            raise ValueError(f"Rol desconocido: {role_code}")

        hashed = password_hash.hash(plain_password)
        row = session.execute(
            text("""INSERT INTO users (username, email, full_name, password_hash, role_id, is_active)
                   VALUES (:username, :email, :full_name, :password_hash, :role_id, :is_active)
                   RETURNING id"""),
            {
                "username": username,
                "email": email,
                "full_name": full_name,
                "password_hash": hashed,
                "role_id": role_id,
                "is_active": is_active,
            },
        )
        session.commit()
        return row.scalar_one()

    def update(
        self,
        session: Session,
        user_id: UUID,
        email: str | None = None,
        full_name: str | None = None,
        plain_password: str | None = None,
        role_code: str | None = None,
        is_active: bool | None = None,
    ) -> dict | None:
        updates = []
        params = {"id": user_id}

        if email is not None:
            updates.append("email = :email")
            params["email"] = email
        if full_name is not None:
            updates.append("full_name = :full_name")
            params["full_name"] = full_name
        if plain_password is not None:
            updates.append("password_hash = :password_hash")
            params["password_hash"] = password_hash.hash(plain_password)
        if role_code is not None:
            role_id = session.execute(
                text("SELECT id FROM roles WHERE code = :code"),
                {"code": role_code},
            ).scalar_one_or_none()
            if role_id is None:
                raise ValueError(f"Rol desconocido: {role_code}")
            updates.append("role_id = :role_id")
            params["role_id"] = role_id
        if is_active is not None:
            updates.append("is_active = :is_active")
            params["is_active"] = is_active

        if updates:
            session.execute(
                text(f"UPDATE users SET {', '.join(updates)} WHERE id = :id"),
                params,
            )
            session.commit()

        return self.get_by_id(session, user_id)

    def delete(self, session: Session, user_id: UUID) -> bool:
        res = session.execute(
            text("DELETE FROM users WHERE id = :id"),
            {"id": user_id},
        )
        session.commit()
        return res.rowcount > 0
