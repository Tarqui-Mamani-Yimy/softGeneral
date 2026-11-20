from __future__ import annotations

import json

from sqlalchemy import text


class DbStatsPublisher:
    """Publishes camera statistics as a `camera_metrics` NOTIFY through a short-lived session."""

    def __init__(self, session_factory):
        self.session_factory = session_factory

    def publish(self, payload: dict) -> None:
        context = self.session_factory()
        if context is None:
            return
        with context as session:
            session.execute(text("SELECT pg_notify('camera_metrics', :payload)"), {"payload": json.dumps(payload)})
            session.commit()
