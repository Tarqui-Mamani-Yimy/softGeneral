Objective: Mode A end to end: an uploaded video is picked up by the worker, processed by the vision pipeline with visible progress, and the annotated result can be downloaded from the web app.
Branch: feat/project-bootstrap · Delivery: ask-on-risk · Test runner: pytest (backend), npm build/lint (frontend). Local machine is CPU only.

## Specs

- S1. Worker claims queued `video_jobs` safely (`SELECT ... FOR UPDATE SKIP LOCKED`), sets `processing` + `started_at`, runs `vision.pipeline.process_video`, writes `STORAGE_DIR/outputs/<job_id>.mp4`, then `completed` + `output_path` + `progress = 100` + `finished_at`; on error `failed` + short `error_message` + `finished_at`. Never two workers on the same job.
- S2. Progress written to `video_jobs.progress` throttled (not every frame). Graceful stop (SIGINT/SIGTERM) puts the current job back to `queued`. On startup, jobs left in `processing` by a dead worker are re-queued (single-worker assumption, documented).
- S3. Models and stride for Mode A configurable by env (default: person tracking + armas + fuegoHumo, stride 2).
- S4. `GET /api/v1/videos/{id}/output` (`videos.read`) streams the annotated MP4 when the job is `completed`; 409 otherwise; never serves a path outside `STORAGE_DIR`.
- S5. Frontend login wired to `POST /auth/login` and `GET /auth/me`; private routes require a session; logout. Token kept in memory + sessionStorage (no localStorage).
- S6. Frontend Videos page: upload with progress bar, list of jobs with status and live progress (polling), download link for completed jobs; buttons hidden when the user lacks `videos.upload`.
- User request (verbatim): "mejor si avanzamos nosotros y luego ellos, hacen lo demas, les comunicare sobre todo, mejor vamos con la siguiente tareas".

## Tasks

| ID | Specs | Route | Status | Evidence |
|---|---|---|---|---|
| T1 | S1-S4 | delegated: opencode via Herdr (parallel unit, backend) | done | 36 passed / 4 skipped, integration 3 passed; agy verified: SKIP LOCKED claim, requeue, path containment, bound SQL — no blockers |
| T2 | S5-S6 | delegated: agy via Herdr (parallel unit, frontend) | done | build + lint pass; opencode verified: sessionStorage only, 401 logout, guarded routes, polling cleanup — no blockers |
| T3 | all | inline: seam check on a throwaway database + independent verification (Risk items 2 and 4) | done | login → upload (queued) → output 409 → worker --once (~12 s) → completed 100% → output 200 video/mp4, 40 frames; CORS from :5173 OK; seam DB dropped |

## Log

- L1 (2026-11-19, user, verbatim): "si, imagino que si tienen, mejor si avanzamos nosotros y luego ellos, hacen lo demas, les comunicare sobre todo, mejor vamos con la siguiente tareas"
- L2: Writer trigger (a): T1 (backend) and T2 (frontend) are independent units with disjoint surfaces; the frontend only consumes the existing API plus the S4 endpoint contract.
- L3: BoT-SORT prints "not enough matching points" on synthetic video (camera motion compensation); with fixed stadium cameras it can be disabled later.
