import json
from dataclasses import dataclass
from datetime import datetime
from uuid import UUID

from sqlalchemy import text
from sqlalchemy.orm import Session


@dataclass
class BannedPersonRecord:
    id: UUID
    full_name: str
    document_id: str | None
    reason: str
    severity: str
    photo_path: str
    face_encoding: list[float]
    is_active: bool
    banned_at: datetime
    notes: str | None
    created_by: UUID | None
    created_at: datetime
    updated_at: datetime


class BannedPersonRepository:
    def list_all(self, session: Session, include_inactive: bool = False) -> list[BannedPersonRecord]:
        clause = "" if include_inactive else "WHERE is_active = TRUE"
        rows = session.execute(
            text(f"""SELECT id, full_name, document_id, reason, severity, photo_path,
                            face_encoding, is_active, banned_at, notes, created_by,
                            created_at, updated_at
                     FROM banned_persons
                     {clause}
                     ORDER BY created_at DESC""")
        ).mappings().all()
        return [self._record(row) for row in rows if row is not None]

    def get_by_id(self, session: Session, person_id: UUID) -> BannedPersonRecord | None:
        row = session.execute(
            text("""SELECT id, full_name, document_id, reason, severity, photo_path,
                           face_encoding, is_active, banned_at, notes, created_by,
                           created_at, updated_at
                    FROM banned_persons
                    WHERE id = :id"""),
            {"id": person_id},
        ).mappings().one_or_none()
        return self._record(row)

    def create(
        self,
        session: Session,
        full_name: str,
        document_id: str | None,
        reason: str,
        severity: str,
        photo_path: str,
        face_encoding: list[float],
        notes: str | None,
        created_by: UUID | None,
    ) -> BannedPersonRecord:
        row = session.execute(
            text("""INSERT INTO banned_persons
                       (full_name, document_id, reason, severity, photo_path,
                        face_encoding, notes, created_by)
                    VALUES
                       (:full_name, :document_id, :reason, :severity, :photo_path,
                        CAST(:face_encoding AS jsonb), :notes, :created_by)
                    RETURNING id, full_name, document_id, reason, severity, photo_path,
                              face_encoding, is_active, banned_at, notes, created_by,
                              created_at, updated_at"""),
            {
                "full_name": full_name,
                "document_id": document_id,
                "reason": reason,
                "severity": severity,
                "photo_path": photo_path,
                "face_encoding": json.dumps(face_encoding),
                "notes": notes,
                "created_by": created_by,
            },
        ).mappings().one()
        session.commit()
        return self._record(row)

    def update(self, session: Session, person_id: UUID, **fields) -> BannedPersonRecord | None:
        current = self.get_by_id(session, person_id)
        if current is None:
            return None
        set_clauses = []
        params = {"id": person_id}
        for key, value in fields.items():
            if value is not None:
                set_clauses.append(f"{key} = :{key}")
                params[key] = value
        if not set_clauses:
            return current
        sql = f"""UPDATE banned_persons
                  SET {', '.join(set_clauses)}, updated_at = now()
                  WHERE id = :id
                  RETURNING id, full_name, document_id, reason, severity, photo_path,
                            face_encoding, is_active, banned_at, notes, created_by,
                            created_at, updated_at"""
        row = session.execute(text(sql), params).mappings().one_or_none()
        session.commit()
        return self._record(row)

    def disable(self, session: Session, person_id: UUID) -> bool:
        result = session.execute(
            text("UPDATE banned_persons SET is_active = FALSE, updated_at = now() WHERE id = :id"),
            {"id": person_id},
        )
        session.commit()
        return result.rowcount > 0

    def delete(self, session: Session, person_id: UUID) -> bool:
        result = session.execute(
            text("DELETE FROM banned_persons WHERE id = :id"),
            {"id": person_id},
        )
        session.commit()
        return result.rowcount > 0

    def _record(self, row) -> BannedPersonRecord | None:
        if row is None:
            return None
        encoding = row["face_encoding"]
        if isinstance(encoding, str):
            encoding = json.loads(encoding)
        return BannedPersonRecord(
            id=row["id"],
            full_name=row["full_name"],
            document_id=row["document_id"],
            reason=row["reason"],
            severity=row["severity"],
            photo_path=row["photo_path"],
            face_encoding=encoding,
            is_active=row["is_active"],
            banned_at=row["banned_at"],
            notes=row["notes"],
            created_by=row["created_by"],
            created_at=row["created_at"],
            updated_at=row["updated_at"],
        )

