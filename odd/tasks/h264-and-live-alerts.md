Objective: make videos and alert clips playable in the browser (H.264) and push new alerts to the guards' screen in real time (WebSocket).
Branch: feat/project-bootstrap · Delivery: ask-on-risk · Test runner: pytest (backend), npm build/lint (frontend). FFmpeg with libx264 is installed locally.

## Specs

- S1. Annotated outputs (`STORAGE_DIR/outputs/*.mp4`) and alert clips (`STORAGE_DIR/alerts/**.mp4`) are H.264 (yuv420p, `+faststart`) so `<video>` plays them in Chrome/Firefox. Conversion uses FFmpeg after the file is closed; if FFmpeg is missing or fails, keep the mp4v file and log a warning (processing never fails because of transcoding).
- S2. Live alerts: when the worker stores an alert, connected guards receive it immediately over a WebSocket, without polling. The worker and the API are separate processes (planning.md: "`worker.py` separado de la API"), so the bridge is PostgreSQL `LISTEN/NOTIFY` (no Redis yet: planning.md "Hilos en memoria al inicio; Redis después").
- S3. WebSocket auth: the client authenticates with its JWT in the first message (not in the URL), the server checks the token and the `alerts.read` permission from `user_permissions`; unauthenticated or unauthorized sockets are closed with a policy-violation code. Messages never include file paths.
- S4. Alerts page shows new alerts instantly (highlight + optional sound off by default) and reconnects automatically with backoff; slow polling stays only as a fallback while disconnected.
- User request (verbatim): "si" — accepting "¿Arranco con el H.264 y el WebSocket en paralelo, uno para cada uno?".

## Tasks

| ID | Specs | Route | Status | Evidence |
|---|---|---|---|---|
| T1 | S1 | delegated: opencode via Herdr (parallel unit: vision media) | done | seam: outputs and both alert clips report codec h264 (ffprobe); no temp files left; not a high-risk item, no separate verifier |
| T2 | S2-S4 | delegated: agy via Herdr (parallel unit: alerts realtime API + UI) | done | 79 passed / 7 skipped, integration 6 passed; seam: WS ready + 2 live intrusion alerts from the worker, no path fields; bad token and silent client closed 1008 |
| T3 | all | inline: seam check (worker → NOTIFY → WebSocket; clip plays as H.264) + cross verification (Risk items 2 and 4) | in progress | seam passed; opencode verifying T2 |

## Log

- L1 (2026-11-19, user, verbatim): "si"
- L2: Writer trigger (a): T1 touches only backend/vision media writing; T2 touches alerts module, main.py lifespan and frontend. Disjoint surfaces; backend/README.md notes for T1 are added by the parent.
