from app.modules.alerts.repository import AlertRepository


def get_alert_repository() -> AlertRepository:
    return AlertRepository()
