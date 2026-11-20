from datetime import UTC, datetime
from uuid import uuid4

import pytest
from app.modules.sports.repository import SportsEventRepository
from sqlalchemy import text


def test_sports_repository_create_and_list(tmp_path):
    from app.core.config import Settings
    from app.core.database import build_engine, build_session_factory

    settings = Settings()
    engine = build_engine(settings.database_url)
    session_factory = build_session_factory(engine)
    repo = SportsEventRepository()

    event_id = uuid4()
    with session_factory() as session:
        repo.create(
            session,
            id=event_id,
            event_type="ball_in_play",
            occurred_at=datetime.now(UTC),
            confidence=0.88,
            snapshot_path="sports/test.jpg",
            details={"ball_box": [10, 10, 20, 20], "active_players": 11},
        )

    with session_factory() as session:
        rec = repo.get_by_id(session, event_id)
        assert rec is not None
        assert rec.event_type == "ball_in_play"
        assert rec.confidence == pytest.approx(0.88, abs=0.01)
        assert rec.details["active_players"] == 11
        assert rec.has_snapshot is True

        summary = repo.get_summary(session)
        assert summary["total_events"] >= 1
        assert summary["total_ball_events"] >= 1

    # Cleanup test row
    with session_factory() as session:
        session.execute(text("DELETE FROM sports_events WHERE id = :id"), {"id": event_id})
        session.commit()

