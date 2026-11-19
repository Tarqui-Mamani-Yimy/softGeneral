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
`JWT_SECRET` (mandatory to start the API and at least 32 characters),
`JWT_EXPIRE_MINUTES` (default 60),
`STORAGE_DIR` (video upload path, default `../datos`), and
`MAX_UPLOAD_MB` (maximum video upload size in MB, default 500).
Worker settings are `WORKER_POLL_SECONDS` (default 2), `WORKER_STRIDE` (default 2),
and `WORKER_MODELS` (default `person,armas,fuegoHumo`).

## Run

```bash
.venv/bin/uvicorn app.main:create_app --factory --reload  # API on http://localhost:8000
.venv/bin/python worker.py                    # vision worker (single worker)
.venv/bin/python worker.py --once             # process at most one queued job
.venv/bin/python -m app.modules.users.create_admin --username admin --email admin@example.com --full-name "First Admin"
```

- `GET /api/v1/health` → `{"status": "ok"}`
- `GET /api/v1/health/db` → `{"database": "ok"}` or `503 {"database": "unavailable"}`
- `POST /api/v1/videos` (permission `videos.upload`) → upload `.mp4`/`.avi`/`.mov`/`.mkv` video
- `GET /api/v1/videos` (permission `videos.read`) → list video jobs (newest first, limit/offset)
- `GET /api/v1/videos/{id}` (permission `videos.read`) → get video job status and progress
- `GET /api/v1/videos/{id}/output` (permission `videos.read`) → download completed MP4
- API docs: http://localhost:8000/docs

The worker re-queues jobs left in `processing` at startup. The current deployment
assumes a single worker process; add a coordinated scheduler before running more
than one worker continuously.

## Tests

```bash
.venv/bin/pytest -q
```
