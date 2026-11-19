# Backend

FastAPI API (modular monolith) plus a separate vision worker.

```
app/
  main.py            # create_app(): settings, DB engine, CORS, routers
  core/              # config (env vars) and database engine
  modules/           # one folder per business module
    health/  auth/  users/  alerts/  cameras/  videos/
vision/              # vision pipeline used by worker.py
worker.py            # vision worker entrypoint (separate process)
tests/
```

The database schema lives in `../database/init/*.sql`. The backend never
creates tables.

## Setup

Requires Python 3.13 and the database container running (see `../database/README.md`).

```bash
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt -r requirements-dev.txt
```

Settings come from environment variables or the repository-root `.env`:
`DATABASE_URL`, `APP_ENV`, `CORS_ORIGINS` (JSON list, default `["http://localhost:5173"]`),
`JWT_SECRET` (mandatory to start the API and at least 32 characters), and
`JWT_EXPIRE_MINUTES` (default 60).

## Run

```bash
.venv/bin/uvicorn app.main:create_app --factory --reload  # API on http://localhost:8000
.venv/bin/python worker.py                    # vision worker
.venv/bin/python -m app.modules.users.create_admin --username admin --email admin@example.com --full-name "First Admin"
```

- `GET /api/v1/health` → `{"status": "ok"}`
- `GET /api/v1/health/db` → `{"database": "ok"}` or `503 {"database": "unavailable"}`
- API docs: http://localhost:8000/docs

## Tests

```bash
.venv/bin/pytest -q
```
