Objective: turn detections into reviewed alerts: zone-based rules engine, alerts API + page, and worker integration with snapshot and clip evidence (Mode A first).
Branch: feat/project-bootstrap · Delivery: ask-on-risk · Test runner: pytest (backend), npm build/lint (frontend). Deployment is explicitly postponed.

## Specs

- S1. Zones: polygons in normalized coordinates (0..1) per scene, types `field`, `authorized`, `stands`, `restricted` (database enum `zone_type`). Loaded from config files (planning.md: "Configurable sin programar: cámaras, zonas y umbrales en archivos de configuración"). A person's position is the bottom-center of its box (feet).
- S2. Intrusion rule (planning.md RF5: "zonas, seguimiento y origen de la persona"): a tracked person whose first observed zone is `stands` or `restricted` and who then stays inside `field` for at least N analyzed frames raises `intrusion`. Origin `field` or `authorized` never alerts. Unknown origin is configurable (default: no alert).
- S3. Fire/smoke rule (RF4 "detección con confirmación temporal"): `fire_smoke` when at least k of the last n analyzed frames have fire or smoke above the confidence threshold, ignoring detections inside configured zones (default `stands`, for flares: planning.md "La pirotecnia ... se cubre con el modelo genérico de fuego y humo").
- S4. Weapon rule (RF3): `weapon` when a gun is detected above the threshold in k of the last n analyzed frames; attach the overlapping person track id when there is one.
- S5. Cooldown / deduplication (planning.md Phase 3 "cooldown y deduplicación por ID"): no repeated alert of the same type for the same track (or the same zone for fire/smoke) within a cooldown measured in video seconds.
- S6. Alerts API: list (filters: status, type, video job; newest first; max 100), get, snapshot and clip download (path contained in STORAGE_DIR), review `confirmed` / `false_alarm` with notes only from `pending` (409 otherwise), writing `audit_log` in the same transaction. Permissions `alerts.read` / `alerts.review`.
- S7. Alerts page: filters, list, detail with snapshot and clip, confirm / false alarm buttons only with `alerts.review`, link from a video job to its alerts.
- S8. Worker integration: rules run inside the pipeline; each alert stores a snapshot (JPEG) and a short clip (seconds before and after) under `STORAGE_DIR/alerts/` and an `alerts` row linked to the video job.
- User request (verbatim): "si, vamos con esa, la parte de los desplegues, lo deajremos para despues, dime que tareas faltan".

## Tasks

| ID | Specs | Route | Status | Evidence |
|---|---|---|---|---|
| T1 | S1-S5 | delegated: opencode via Herdr (parallel unit: pure rules engine + config) | done | 12 vision tests pass (rerun by parent); engine imports without torch |
| T2 | S6-S7 | delegated: agy via Herdr (parallel unit: alerts API + page) | done | 53 passed / 5 skipped, integration 4 passed, frontend build + lint pass (rerun by parent); review uses conditional UPDATE ... WHERE status='pending' |
| T3 | S8 | delegated: opencode via Herdr (sequential: depends on T1+T2); 2 integration bugs fixed inline by parent (L4, L5) | done | 66 passed / 6 skipped, integration 5 passed; seam: real people crossing stands→field produced 2 intrusion alerts with snapshot + 41/61-frame clips, review 200 then 409, audit alert.confirmed |
| T4 | all | seam check on a throwaway database + independent verification (Risk item 2: review/audit) | done | agy verified T3 + path fix (traversal, absolute outside, symlink, cleanup) PASS; opencode verified T2 review (conditional UPDATE, audit, 409, permissions, no paths, frontend blobs) PASS; no blockers |

## Log

- L1 (2026-11-19, user, verbatim): "si, vamos con esa, la parte de los desplegues, lo deajremos para despues, dime que tareas faltan"
- L2: Writer trigger (a): T1 (pure engine, no DB/HTTP) and T2 (API + UI over the existing `alerts` table) are independent with disjoint surfaces. T3 depends on both and runs after.
- L3: No real football video is available yet; thresholds are defaults to tune later with real footage.
- L4: Seam test found the worker calling `create_alert` on `VideoRepository` (the unit tests used one fake with both roles), so every job with an alert failed; the stop path also skipped alert cleanup through `hasattr`. Fixed by injecting `AlertRepository` as `alert_repository`; RED tests added in `tests/test_alerts_worker.py`.
- L5: Seam test found snapshot/clip returning 404: `get_contained_file` resolved relative evidence paths against the process working directory instead of STORAGE_DIR. Fixed in `app/modules/videos/paths.py`; RED tests in `tests/test_paths.py` (relative, absolute, traversal, symlink).
- L6: Open follow-up: clips and outputs are written with the mp4v codec, which most browsers cannot play inline; the Alerts page `<video>` needs H.264 (FFmpeg) to show clips.
