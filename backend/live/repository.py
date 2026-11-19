import json

from sqlalchemy import text


class LiveAlertRepository:
    """Alert persistence adapter for camera alerts, which have no video job."""

    def create_alert(self, session, **values):
        row = session.execute(
            text("""INSERT INTO alerts
                   (id, alert_type, camera_id, video_job_id, occurred_at, confidence,
                    track_id, snapshot_path, clip_path, details, status)
                   VALUES (:id, :alert_type, :camera_id, NULL, :occurred_at, :confidence,
                           :track_id, :snapshot_path, :clip_path,
                           CAST(:details AS jsonb), 'pending')
                   RETURNING id"""),
            {**values, "details": json.dumps(values["details"])},
        )
        alert_id = row.scalar_one()
        payload = json.dumps({"id": str(alert_id), "alert_type": values["alert_type"], "occurred_at": values["occurred_at"].isoformat()})
        session.execute(text("SELECT pg_notify('alerts', :payload)"), {"payload": payload})
        return alert_id
