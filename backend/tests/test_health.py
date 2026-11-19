from fastapi.testclient import TestClient

from app.core.config import Settings
from app.main import create_app
from app.modules.health.router import database_check

# Port 1 is never a PostgreSQL server, so the connection is refused fast.
UNREACHABLE_DB = "postgresql+psycopg://user:pass@127.0.0.1:1/none"


def make_client(**overrides) -> TestClient:
    settings = Settings(database_url=UNREACHABLE_DB, **overrides)
    return TestClient(create_app(settings))


def test_health_returns_ok():
    response = make_client().get("/api/v1/health")

    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_health_db_returns_503_when_database_is_unreachable():
    response = make_client().get("/api/v1/health/db")

    assert response.status_code == 503
    assert response.json() == {"database": "unavailable"}


def test_health_db_returns_200_when_database_answers():
    client = make_client()
    client.app.dependency_overrides[database_check] = lambda: True

    response = client.get("/api/v1/health/db")

    assert response.status_code == 200
    assert response.json() == {"database": "ok"}


def test_cors_allows_only_configured_origins():
    client = make_client(cors_origins=["http://localhost:5173"])
    preflight = {"Access-Control-Request-Method": "GET"}

    allowed = client.options("/api/v1/health", headers={"Origin": "http://localhost:5173", **preflight})
    denied = client.options("/api/v1/health", headers={"Origin": "http://evil.example", **preflight})

    assert allowed.headers.get("access-control-allow-origin") == "http://localhost:5173"
    assert "access-control-allow-origin" not in denied.headers
