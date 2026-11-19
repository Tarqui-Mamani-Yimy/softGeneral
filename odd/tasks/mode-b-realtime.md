Objective: Mode B, real-time analysis of camera streams with live alerts and a smooth annotated live view in the browser, testable locally with a simulated RTSP camera.
Branch: feat/project-bootstrap · Delivery: ask-on-risk · Test runner: pytest (backend), npm build/lint (frontend). Local machine: CPU only (detectors ~350-470 ms per inference), so local runs prove behavior, not final FPS.

## Specs

- S1. `RTSPSource` (and webcam by device index) implements `VideoSource`; a reader thread keeps ONLY the latest frame and drops old ones (planning.md §2: "un hilo lector que conserva solo el último fotograma y descarta los viejos, para que el análisis nunca acumule retraso"); reconnects with backoff when the stream drops.
- S2. Live worker per camera (cameras from the `cameras` table, `is_active`, source `rtsp`/`webcam`): runs the same analyzers + rules engine as Mode A on the latest frame, stores alerts with `camera_id` (no video job), snapshot + clip evidence, and the existing NOTIFY → WebSocket path delivers them live.
- S3. Smooth view: the annotated stream is published at the camera FPS, redrawing the latest detections between analyzed frames (analysis FPS can be lower), to MediaMTX path `<camera_code>_annotated`.
- S4. Metrics: analysis FPS, dropped frames and frame-to-alert latency logged periodically (planning.md targets: latency ≤ 2 s, ≥ 10 FPS on the real GPU).
- S5. Simulated camera for development (planning.md: "simular una cámara RTSP con MediaMTX + FFmpeg a partir de un video en bucle"): MediaMTX in docker compose (local only, bound to 127.0.0.1) and a script that publishes a looping video as an RTSP camera.
- S6. Cameras API: list/get with `cameras.read` (guards never see `source_url`, which may hold credentials), create/update/disable with `cameras.manage`, audited.
- S7. Cameras page: grid of live annotated players (MediaMTX WebRTC), camera status; admin form to add/edit/disable cameras.
- User request (verbatim): "si" — accepting "¿Seguimos con el tiempo real (Modo B)?".

## Tasks

| ID | Specs | Route | Status | Evidence |
|---|---|---|---|---|
| T1 | S1-S4 | delegated: opencode via Herdr; correction batch partly done by opencode (items 2-6) before its quota ran out, items 1 and 7 plus L6-L7 finished inline by the parent | done | 104 passed / 9 skipped; seam: 343 annotated frames in 35 s (9.8 FPS) with 1 publisher session, analysis ~2.8 FPS on CPU, live alert over WebSocket ~200 ms frame-to-alert, clean shutdown |
| T2 | S5-S7 | delegated: agy via Herdr (parallel unit: MediaMTX + simulated camera + cameras API + page) | done | 1938e3e; MediaMTX 1.21.4 (86 MB), sim camera publishes H.264, camera registered via API (201) |
| T3 | all | inline: seam check (sim camera → live worker → alert over WebSocket + annotated stream) + cross verification (Risk items 2 and 4) | in progress | seam passed; agy verifies T1, a Sonnet subagent verifies T2 (opencode out of quota) |

## Log

- L1 (2026-11-19, user, verbatim): "si"
- L2: Writer trigger (a): T1 (backend/vision live sources + live worker) and T2 (compose/MediaMTX/scripts, cameras API module, frontend) are independent with disjoint surfaces; `backend/app/core/config.py` belongs to T1, `docker-compose.yml` to T2.
- L3: Known limit: MediaMTX streams are unauthenticated in this local setup; stream auth (MediaMTX HTTP auth hook against the API) is required before any deployment.
- L4: Seam test (MediaMTX + sim camera + live worker on a throwaway DB): the live intrusion alert was stored correctly (camera_id set, video_job_id NULL, snapshot), analysis ran at ~2 FPS on CPU, but: (1) `RTSPSource.frame_size` is (0, 0) and fps 30 right after opening (stream is 10 FPS), so the publisher started ffmpeg with `-s 0x0` and published 0 frames; (2) `live/runner.py` breaks the loop on the first `read()` timeout, ending the camera on any short gap; (3) analysis runs inline in the publish loop, so the published stream is analysis-bound, not smooth (S3); (4) timestamps are subtracted twice (`timestamp - started`); (5) `live_worker.py` never configures logging, so metrics (S4) are invisible; (6) ffmpeg stderr is discarded and the publisher restarts recursively on every frame; (7) process exit leaves the OpenCV reader thread alive ("terminate called without an active exception"). Sent back to opencode as one correction batch.
- L5: opencode stopped mid-batch with "You have exceeded your monthly quota"; items 2-6 were in place, items 1 and 7 (RTSPSource first-frame wait, fps measurement, close on the reader thread) were finished inline with RED tests.
- L6: Second seam run: MediaMTX dropped the annotated publisher every 10 s because ffmpeg pushed RTP over UDP while Docker only maps RTSP/TCP; fixed with `-rtsp_transport tcp` (RED test `test_publisher_pushes_rtsp_over_tcp`).
- L7: Third seam run: the first decodable frame took > 10 s because the sim camera used the x264 default GOP (~250 frames), so the publisher was again sized 0x0. Fixed twice: the runner now sizes publisher/evidence/rules from the first decoded frame (RED test `test_publisher_and_evidence_use_the_first_real_frame_size`), and `scripts/sim_camera.sh` emits a keyframe every 20 frames.
- L8: On CPU the redrawn boxes visibly trail moving people (analysis ~2.8 FPS vs 10 FPS publish); expected with the smooth-view design and should disappear with GPU analysis rates.
- L9: Sonnet verifier on T2 found a blocker (PATCH with only `source_type` skipped validation, e.g. file camera `/videos/a.mp4` became `rtsp`) and a credential leak (`camera.updated` audit stored the raw `source_url`). Fixed by the parent: PATCH validates the resulting type/URL pair; audit stores `redact_url_credentials(...)`. RED tests: `test_patch_validates_the_resulting_source_type_and_url` (3 failing cases) and `test_camera_audit_log_never_stores_stream_credentials`.
- L10: Verifier notes not applied: concurrent duplicate camera codes rely on the DB UNIQUE constraint and may surface as 500 instead of 409; `sim_camera.sh` does not validate the stream path characters; MediaMTX accepts publishing on any path without auth (localhost only, see L3).
