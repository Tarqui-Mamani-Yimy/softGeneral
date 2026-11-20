Objective: make the webcam demo produce alerts that can be shown on purpose, and show live analysis statistics on the demo page.
Branch: feat/project-bootstrap · Delivery: ask-on-risk · Test runner: pytest (backend), npm build/lint (frontend).

## Specs

- S1. Demo zones: cameras whose code starts with `demo_` use `DEMO_ZONES_FILE` (default `../config/zones/demo.json`) instead of `WORKER_ZONES_FILE`: stands strips on the left and right edges, field in the center, full height, no authorized tunnel. Walking into the frame from a side and staying in the center raises an `intrusion` alert. Regular cameras keep their zones.
- S2. Live statistics: the live runner publishes, every `LIVE_STATS_SECONDS` (default 2), a `camera_metrics` notification (PostgreSQL `NOTIFY`, same path as alerts) with `camera_id`, `analysis_fps`, `published_fps`, `dropped_frames`, `frame_to_alert_ms` (last alert, or null), `people_tracked` (people in the latest analysis), `detections` (count per label in the latest analysis) and `updated_at`. Publishing stats must never stop analysis.
- S3. The API listener forwards those notifications to authenticated WebSocket clients as `{"type": "camera_metrics", "camera_id": ..., "metrics": {...}}` (no paths, no URLs); clients without `cameras.read` do not receive them.
- S4. Demo page: a live statistics panel for the session camera (analysis FPS, video FPS, people tracked, detections by type, last frame-to-alert latency, "updated Xs ago"), and a short on-page hint explaining how to trigger an intrusion (step out of the frame to one side and walk back into the center).
- User request (verbatim): "hagamos las que me marcaste como No" (the alerts-with-webcam rules issue and the missing statistics panel).

## Tasks

| ID | Specs | Route | Status | Evidence |
|---|---|---|---|---|
| T1 | S1-S3 | delegated: Sonnet subagent (parallel unit: backend; opencode out of quota) | done | real RED (10 failed) → 143 passed; also fixed stride=1 analyzing no frames |
| T2 | S4 | delegated: agy via Herdr (parallel unit: frontend) | done | build + lint pass |
| T3 | all | inline: browser seam (fake webcam crossing → intrusion + stats on the page) + verification | done | agy verified 3f3abd6: 6/6 PASS, no blockers (143 passed, integration 12 passed); Chromium + fake webcam with default demo zones: stats visible at 9 s (analysis 3.3 FPS, video 10.0, people 2, latency 433 ms), intrusion demo_stands_left → demo_field at 15 s, hint shown, no page errors |

## Log

- L1 (2026-11-19, user, verbatim): "hagamos las que me marcaste como No"
- L2: Context: in the user's webcam demo 0 alerts were stored; the person's feet fell inside `authorized_tunnel` of `config/zones/example.json`, so intrusion can never fire; analysis ran at 0.45 FPS on CPU.
- L3: Writer trigger (a): T1 (backend/live, alerts listener/broadcaster, config, config/zones/demo.json) and T2 (frontend) are independent; contract in S2-S3.
- L4: Reported flaky integration test (1 of 4 runs) explained: `test_stats_notify_reaches_a_listening_connection` took the first notification on the shared `camera_metrics` channel, so a running live worker on the same database could deliver a foreign payload (reproduced: old logic returned another payload under a concurrent publisher). Fixed to wait for the payload carrying the test's camera id; 6/6 integration runs pass and the test passes with a concurrent publisher.
