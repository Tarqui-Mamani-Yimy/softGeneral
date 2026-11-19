# softGeneral

Computer-vision assistant for stadium security guards. It analyzes uploaded videos and live camera streams, detects risk events (field intruders, weapons, fire and smoke) and alerts the guards with a snapshot, a short clip, the camera and the time. **A person always makes the final decision.**

Full project plan, requirements and decisions: [`planning.md`](planning.md).

## Status

| Area | State |
|---|---|
| Database (PostgreSQL, plain SQL), roles and permissions, audit log | Done |
| Authentication (JWT) and permission checks | Done |
| Mode A: upload a video, process it, download the annotated result (H.264) | Done |
| Mode B: live camera (RTSP) analysis with a smooth annotated stream | Done |
| Rules: field intrusion, weapons, fire/smoke (flares in the stands ignored) | Done, thresholds not yet tuned on real footage |
| Alerts: snapshot + clip, review (confirm / false alarm), live push over WebSocket | Done |
| Cameras management | Done |
| Zone drawing tool, user administration page, public share view | Pending |
| Tests on real match footage, GPU deployment, MediaMTX stream authentication | Pending |

## Architecture

```
Uploaded video ─┐                                           ┌─► Web app (React)
                ├─► worker.py ──┐                           │    guards / admin
RTSP camera ────┴─► live_worker.py ─► rules ─► alerts ──► API (FastAPI) ──► WebSocket (live alerts)
                     (YOLO + tracking)            │        │
                                                  ▼        ▼
                                        PostgreSQL (LISTEN/NOTIFY)   MediaMTX (annotated live stream, WebRTC)
```

- One backend organized by business module (`backend/app/modules/*`) plus separate worker processes for vision.
- The database schema is defined only by the SQL files in [`database/init`](database/init); the backend never creates tables.
- The API checks **permissions** (for example `alerts.review`), never role names.

## Repository layout

| Path | Contents |
|---|---|
| `backend/` | FastAPI API, `worker.py` (Mode A), `live_worker.py` (Mode B), `vision/` pipeline, tests |
| `frontend/` | React + Vite + TypeScript + Tailwind web app |
| `database/` | PostgreSQL schema and seed (`init/*.sql`), schema smoke test |
| `modelos/` | Trained YOLO11 models: `futbol.pt`, `armas.pt`, `fuegoHumo.pt`, `peleas.pt` |
| `config/` | Rule thresholds (`rules.yaml`) and zone polygons (`zones/*.json`) |
| `mediamtx/` | MediaMTX configuration for live streams |
| `scripts/` | `sim_camera.sh`: publishes a looping video as an RTSP camera |
| `odd/tasks/` | Feature specs, task logs and verification evidence |

## Requirements

- Linux (tested on Debian 13)
- Docker with Docker Compose v2
- Python 3.13
- Node.js 24
- FFmpeg with `libx264` (`ffmpeg -encoders | grep libx264`)
- Optional: NVIDIA GPU with CUDA for real-time speed. Without a GPU everything works, but each detector takes about 0.3-0.5 s per frame on CPU.

## Getting started

### 1. Environment file

Create `.env` in the repository root (it is ignored by Git). Use your own values:

```dotenv
POSTGRES_DB=softgeneral
POSTGRES_USER=softgeneral
POSTGRES_PASSWORD=change-me
POSTGRES_PORT=5432
DATABASE_URL=postgresql+psycopg://softgeneral:change-me@localhost:5432/softgeneral
# At least 32 characters. Generate one with:
#   python3 -c "import secrets; print(secrets.token_urlsafe(48))"
JWT_SECRET=replace-with-a-long-random-secret
```

The API refuses to start without `JWT_SECRET` or with one shorter than 32 characters.

### 2. Database

```bash
docker compose up -d db
docker compose ps          # STATUS should say "healthy"
```

The SQL files in `database/init` run on the first start of an empty volume. See [`database/README.md`](database/README.md) for schema changes and the schema test.

### 3. Backend

```bash
cd backend
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt -r requirements-dev.txt
```

Vision dependencies (needed by the workers). Install PyTorch first, then the rest:

```bash
# CPU only (no NVIDIA GPU) - smaller download:
.venv/bin/pip install --index-url https://download.pytorch.org/whl/cpu torch torchvision
# With an NVIDIA GPU, install the CUDA build instead (see https://pytorch.org/get-started/locally/)

.venv/bin/pip install -r requirements-vision.txt
```

Create the first administrator (the password is asked interactively, never passed as an argument):

```bash
.venv/bin/python -m app.modules.users.create_admin --username admin --email admin@example.com --full-name "First Admin"
```

Run the API:

```bash
.venv/bin/uvicorn app.main:create_app --factory --reload   # http://localhost:8000, docs at /docs
```

### 4. Frontend

```bash
cd frontend
cp .env.example .env.local
npm install
npm run dev                # http://localhost:5173
```

Log in with the administrator created above.

## Mode A: uploaded videos

1. Upload a video from the **Videos** page (`.mp4`, `.avi`, `.mov`, `.mkv`).
2. Run the worker in another terminal:
   ```bash
   cd backend
   .venv/bin/python worker.py          # keeps polling the queue
   .venv/bin/python worker.py --once   # processes at most one job
   ```
3. Follow the progress on the Videos page, download the annotated video and review its alerts on the **Alerts** page.

Zones and thresholds come from `config/rules.yaml` and `config/zones/example.json` (override with `WORKER_RULES_FILE` and `WORKER_ZONES_FILE`). See [`config/README.md`](config/README.md).

## Mode B: live cameras

Without a real camera, simulate one with MediaMTX and a looping video:

```bash
docker compose up -d mediamtx
./scripts/sim_camera.sh path/to/video.mp4 cam_north_01
```

Register the camera from the **Cameras** page (admin) or the API, with source type `rtsp` and URL `rtsp://127.0.0.1:8554/cam_north_01`. Then start the live worker:

```bash
cd backend
.venv/bin/python live_worker.py --camera cam_north_01   # or --all for every active camera
```

The annotated stream appears on the Cameras page, and new alerts show up instantly on the Alerts page. Details: [`mediamtx/README.md`](mediamtx/README.md).

## Configuration

Settings are read from environment variables or the root `.env`.

| Variable | Default | Purpose |
|---|---|---|
| `DATABASE_URL` | `postgresql+psycopg://softgeneral:change-me@localhost:5432/softgeneral` | Database connection |
| `JWT_SECRET` | none (required) | Token signing secret, 32+ characters |
| `JWT_EXPIRE_MINUTES` | `60` | Token lifetime |
| `CORS_ORIGINS` | `["http://localhost:5173"]` | Allowed web origins (JSON list) |
| `STORAGE_DIR` | `../datos` | Uploads, annotated outputs and alert evidence (ignored by Git) |
| `MAX_UPLOAD_MB` | `500` | Upload size limit |
| `WORKER_MODELS` | `person,armas,fuegoHumo` | Models used by the workers |
| `WORKER_STRIDE` | `2` | Mode A: analyze one frame out of N |
| `WORKER_RULES_FILE` / `WORKER_ZONES_FILE` | `../config/...` | Rule thresholds and zones |
| `LIVE_ANALYSIS_STRIDE` | `3` | Mode B: analysis stride |
| `MEDIAMTX_PUBLISH_URL` | `rtsp://127.0.0.1:8554` | Where the live worker publishes annotated streams |
| `VIDEO_TRANSCODE_H264` | `true` | Convert outputs and clips to H.264 for browsers |

Frontend: `VITE_API_URL` and `VITE_MEDIAMTX_WEBRTC_URL` in `frontend/.env.local`.

## Tests

```bash
cd backend
.venv/bin/pytest -q                                   # unit and API tests
TEST_DATABASE_URL=postgresql+psycopg://softgeneral:change-me@localhost:5432/softgeneral \
  .venv/bin/pytest -q -m integration                  # against the local database, rolled back
RUN_MODEL_TESTS=1 .venv/bin/pytest -q -m models tests/vision   # loads the real .pt models

cd ../frontend
npm run build && npm run lint
```

## Working as a team

- Never commit to `main` directly: create a branch per task (`feat/...`, `fix/...`) and open a pull request.
- Use [Conventional Commits](https://www.conventionalcommits.org/) (`feat:`, `fix:`, `docs:`, ...).
- Keep tests passing; add a test for every new rule or endpoint.
- Never commit `.env`, uploaded videos or `datos/`.

## Security notes

- Everything is configured for **local use**: the database and MediaMTX ports are bound to `127.0.0.1`.
- MediaMTX streams have **no authentication** yet. Add stream authentication before any deployment.
- The Ultralytics models are AGPL-3.0; see the "Licencias" row of the risks table in `planning.md`.
