Objective: a "Try demo" option in the web app that streams the presenter's own webcam from the browser to the server and shows the annotated live view and live alerts, working the same locally and in the cloud.
Branch: feat/project-bootstrap · Delivery: ask-on-risk · Test runner: pytest (backend), npm build/lint (frontend).

## Specs

- S1. The browser captures the user's webcam (`getUserMedia`) and publishes it to MediaMTX over WebRTC WHIP (`<webrtc base>/<publish_path>/whip`), preferring H.264. The server never needs a physical camera (user: "utilicemos la camara de mi computador nomas"; the demo must work in the cloud, so the camera lives in the browser, not on the server).
- S2. Demo sessions API, permission `cameras.manage`: `POST /api/v1/demo/sessions` creates a temporary camera (code `demo_<8 hex>`, source `rtsp://127.0.0.1:8554/<code>`) and returns `{id, camera_code, publish_path, whip_url, live_path, expires_at}`; `GET /api/v1/demo/sessions/current` returns the active one or 404; `DELETE /api/v1/demo/sessions/{id}` ends it (camera disabled). Only one active demo at a time: a new session disables previous demo cameras. All changes audited. `source_url` never returned.
- S3. The API never runs vision work. `python live_worker.py --watch` supervises cameras: every `LIVE_WATCH_SECONDS` it starts a runner for each new active rtsp/webcam camera, stops runners whose camera was disabled, and disables demo cameras older than `DEMO_MAX_MINUTES` (audit by the system). Existing `--camera` / `--all` keep working.
- S4. Demo page ("Try demo"): start button → create session → camera permission → WHIP publish; shows the local preview, the annotated live stream (`live_path`) and the live alerts of that camera (existing WebSocket, filtered by camera id); stop button → close the peer connection and delete the session; also cleans up on leaving the page. Clear states and errors (camera denied, MediaMTX unreachable, waiting for analysis).
- User request (verbatim): "y si el tiempo real, ponemos una opcion que diga "probar demo" o algo asi, y utilicemos la camara de mi computador nomas" → chosen option "B".

## Tasks

| ID | Specs | Route | Status | Evidence |
|---|---|---|---|---|
| T1 | S2-S3 | delegated: Sonnet subagent (parallel unit: demo API + live watcher; opencode out of quota) | done | 128 passed; the subagent reported that the demo API tests were written after the router (simulated RED); supervisor tests were written first |
| T2 | S1, S4 | delegated: agy via Herdr (parallel unit: demo page + WHIP client) | done | build + lint pass; readiness probe replaced by the parent (L4) |
| T3 | all | inline: seam check (browser-like WHIP publisher → MediaMTX → watcher → WebSocket alert) + cross verification (Risk items 2 and 4) | done | agy verified 7da93fd: 6/6 PASS, no blockers (131 passed, integration 11 passed); deployment risk on MediaMTX anonymous api recorded in L5; real Chromium + fake webcam: login → Try demo → Live, annotated stream with boxes, 3 live intrusion alerts on the page, Stop disables the demo camera |

## Log

- L1 (2026-11-19, user, verbatim): "y si el tiempo real, ponemos una opcion que diga "probar demo" o algo asi, y utilicemos la camara de mi computador nomas"
- L2 (2026-11-19, user, verbatim): "B"
- L3: Writer trigger (a): T1 (backend/app/modules/demo, backend/live, live_worker.py, config.py) and T2 (frontend) are independent with the API contract in S2. In the cloud, `getUserMedia` requires HTTPS; locally `http://localhost` is allowed.
- L4: First browser seam run stayed on "Waiting for analysis" and never showed the annotated stream: the page probed the MediaMTX player URL with HEAD, which MediaMTX answers 404 even when the stream exists (verified: HEAD 404, GET 302 on a live path). Fixed by the parent: `GET /api/v1/demo/sessions/{id}/stream` asks the MediaMTX control API (`/v3/paths/get/<path>`, `ready`) server-side; the page polls it while the session lives. RED tests in `tests/test_demo.py` (endpoint, 404 for regular cameras, probe fails closed on 404/unreachable).
- L5: MediaMTX control API enabled on :9997 (bound to 127.0.0.1). Requests come through the Docker network, so `authInternalUsers` now allows the `api` action for any user locally; this must be replaced by authenticated users before deployment (same as L3 of mode-b-realtime).
- L6: Alerts panel showed raw details JSON; it now shows `origin_zone → zone`.
- L7: User report on Firefox: "ERROR: codecs not supported by client". MediaMTX logs confirmed it: libx264 defaults to the High profile, while Firefox WebRTC only plays H.264 Constrained Baseline (Chromium accepts High, so the Chromium seam missed it). Publisher and sim camera now encode `-profile:v baseline -bf 0` with a keyframe every 2 s (`-g`); verified with ffprobe on a live stream: `h264,Constrained Baseline,0`. RED test `test_publisher_encodes_h264_constrained_baseline_for_webrtc_browsers`.
