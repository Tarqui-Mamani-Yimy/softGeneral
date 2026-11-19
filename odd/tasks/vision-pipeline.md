Objective: first working vision pipeline for uploaded videos (planning.md Phase 1) plus the video-jobs API.
Branch: feat/project-bootstrap · Delivery: ask-on-risk · Test runner: pytest (backend). Local machine: CPU only (Intel i7, no NVIDIA), ~3.8 GB free disk.

## Specs

- S1. `VideoSource` interface with a `FileSource` implementation (planning.md §2: "Una interfaz de fuente de video única (`VideoSource`) ... `FileSource` (archivo) y `RTSPSource` (cámara)"). RTSPSource is out of scope here.
- S2. Load the four trained models from `modelos/` (futbol, armas, fuegoHumo, peleas) with class filtering and confidence thresholds; device configurable, CPU locally.
- S3. Person detection (pretrained COCO) + tracking with stable IDs (BoT-SORT), planning.md Phase 1 "Detección de personas + seguimiento (BoT-SORT)".
- S4. Annotated video output with OpenCV (boxes, labels, track IDs) and a run summary (frames, detections per label, processing FPS); progress callback usable for `video_jobs.progress`.
- S5. Quick test command per model (planning.md "Script de prueba rápida de cada modelo"), reporting classes and CPU ms per inference.
- S6. Video jobs API: upload a video (permission `videos.upload`), list and get jobs (`videos.read`), stored as a `video_jobs` row with status `queued`; uploads saved under `datos/` with server-generated names; audit `video.uploaded`.
- S7. Disk safety: torch installed CPU-only (no CUDA wheels); tests never write inside the repository.
- User request (verbatim): "entonces vamos con la siguiente tarea".

## Tasks

| ID | Specs | Route | Status | Evidence |
|---|---|---|---|---|
| T1 | S1-S5, S7 | delegated: opencode via Herdr (parallel unit, surface `backend/vision/**`, worker deps) | done | 9eb22b0; 4 models load with expected classes; CPU ms: futbol 468, armas 357, fuegoHumo 343, peleas 23; parent removed duplicate OpenCV package |
| T2 | S6 | delegated: agy via Herdr (parallel unit, surface `backend/app/modules/videos/**`, `main.py`) | done | 28 passed / 3 skipped; integration 2 passed (rerun by parent) |
| T3 | all | inline: seam check + independent verification of T2 (upload handling, Risk item 2) | done | process-video end to end OK; opencode verified T2: traversal, extension, size limit, cleanup, permissions PASS; DB left at 0 rows |

## Log

- L1 (2026-11-19, user, verbatim): "entonces vamos con la siguiente tarea" (after the status summary that listed "Pipeline de visión" as the next block).
- L2: Writer trigger (a): T1 and T2 are independent units with disjoint surfaces, launched together. Only T2 edits `backend/app/main.py`. Parent owns git and `odd/`.
- L3: Freed npm, pip and Docker build caches with user approval ("si, libera"); free disk went from 2.2 GB to 3.8 GB.
- L4: ultralytics depends on opencv-python while requirements-vision.txt also listed opencv-python-headless; both install the same cv2 module, so the parent removed the headless entry and reinstalled a single OpenCV.
- L5: Verifier flagged `limit>100` returning 422 instead of clamping; accepted as valid (S6 asked for a sane max of 100, and the clamp wording came from the parent's verifier prompt).
