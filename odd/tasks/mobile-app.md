Objective: Expo (React Native) mobile app in `mobile/` for guards and admins on the move: login, live alert feed, alert review, camera live view.
Branch: feat/mobile-app · Delivery: ask-on-risk · Test runner: jest (jest-expo) in `mobile/`. Forecast: ~1200 authored lines.

## Specs

- S1. New folder `mobile/` with an Expo (React Native, TypeScript) app, independent from `frontend/` (own package.json). User request: "podrias añadir una carpeta llamada "mobile", en donde me ayudes a hacer una version mobile"; technology chosen by the user: "Expo (React Native)".
- S2. Server settings: the API base URL (and MediaMTX WebRTC URL) are configurable from the app, because a phone cannot reach `localhost`. Defaults come from `EXPO_PUBLIC_API_URL` / `EXPO_PUBLIC_MEDIAMTX_WEBRTC_URL`. (assumption: scope chosen by the agent)
- S3. Login with username or email + password against `POST /api/v1/auth/login`; the token is stored in secure storage (expo-secure-store) and restored on launch via `GET /auth/me`; any 401 logs the user out. (assumption)
- S4. Alert feed: list from `GET /alerts` with status filter (pending / confirmed / false_alarm / all), pull to refresh, and live updates over the alerts WebSocket (`/alerts/ws`, auth frame `{type:"auth",token}`, `ready`, `alert`, ping every 30 s, backoff reconnect, no reconnect on 1000/1008). New alerts raise a local notification. (assumption)
- S5. Alert detail: type, confidence, camera, time, snapshot image (`GET /alerts/{id}/snapshot` with bearer token) and, when the user has `alerts.review`, confirm / mark false alarm with optional notes via `POST /alerts/{id}/review`. (assumption)
- S6. Cameras: list from `GET /cameras` (requires `cameras.read`) and a live view of the annotated stream through the MediaMTX built-in WebRTC player in a WebView. (assumption)
- S7. Profile screen with user, role, server settings and logout. UI text in Spanish to match the web frontend. (assumption)

## Tasks

| ID | Specs | Route | Status | Evidence |
|---|---|---|---|---|
| T1 | S1, S2, S3, S7 | inline (no writer trigger: single unit, sequential) | done | RED 4 suites missing modules → GREEN 25 tests; tsc, eslint, expo-doctor 20/20, android export OK |
| T2 | S4, S5 | inline | done | alertStream tests (auth frame, ready, ping, backoff, 1008, stop); endpoints checked in backend routers |
| T3 | S6 | inline | done (device test pending) | android export OK; not run on a phone: backend was not running |

## Log

- L1 (2026-11-20, user, verbatim): "podrias añadir una carpeta llamada "mobile", en donde me ayudes a hacer una version mobile"
- L2 (2026-11-20, user answer): technology "Expo (React Native) (Recommended)".
- L3: Scope S2-S7 chosen by the agent as the guard-facing MVP (admin CRUD screens stay on the web). Native WebRTC (react-native-webrtc) would need a development build, so S6 uses the MediaMTX web player inside a WebView to keep Expo Go working.
- L4: Verification 2026-11-20: jest 25 passed, `tsc --noEmit` clean, `eslint .` clean, `expo-doctor` 20/20, `expo export --platform android` bundled. Pending: manual run in Expo Go against a live backend (needs uvicorn `--host 0.0.0.0` and MediaMTX ports published on 0.0.0.0, see mobile/README.md). Face-match alerts are not produced by the worker yet; the detail screen shows `details.person_name` only if present.
