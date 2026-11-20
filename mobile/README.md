# softGeneral Mobile

Expo (React Native) app for guards and admins on the move. It talks to the same backend as the web frontend.

| Screen | What it does | Permission |
|---|---|---|
| Login | Username or email + password. The token is kept in the device secure storage. | — |
| Alerts | Feed with status filters and pull-to-refresh. Live updates over the alerts WebSocket, plus a local notification for each new alert. | `alerts.read` |
| Alert detail | Snapshot, confidence, time and source. Confirm the alert or mark it as a false alarm, with notes. | `alerts.review` to review |
| Cameras | Camera list. Tapping one opens its annotated live stream in the MediaMTX WebRTC player. | `cameras.read` |
| Profile | User, role, server URLs and logout. | — |

Admin CRUD screens (users, cameras, banned persons, zones) stay on the web.

## Run it

Requirements: Node 20+ and the **Expo Go** app on your phone. The phone and the PC must be on the same Wi-Fi network.

```bash
cd mobile
npm install
npm start          # scan the QR code with Expo Go (Android) or the Camera app (iOS)
```

In Expo Go the app guesses the server from your PC's IP: `http://<pc-ip>:8000/api/v1` for the API and `http://<pc-ip>:8889` for live video. You can change both from **Login → Configurar servidor** or **Perfil**. To fix them at build time, copy `.env.example` to `.env`.

### The phone must be able to reach the backend

The default local setup only listens on `localhost`, which the phone cannot reach:

1. **Backend**: start uvicorn on every interface.

   ```bash
   .venv/bin/uvicorn app.main:create_app --factory --reload --host 0.0.0.0
   ```

2. **MediaMTX (live video)**:
   - `docker-compose.yml` publishes its ports on `127.0.0.1`. Publish `8889/tcp` and `8889/udp` on `0.0.0.0` instead, for example with a local `docker-compose.override.yml`.
   - Set `webrtcAdditionalHosts: [<pc-ip>]` in `mediamtx/mediamtx.yml` so WebRTC advertises an address the phone can use.
3. **Firewall**: allow ports 8000 and 8889 (TCP and UDP) on the PC.

## Develop

```bash
npm test           # jest (jest-expo): URL helpers, API client, alerts WebSocket client, formatting
npm run typecheck  # tsc --noEmit
npm run lint       # eslint (eslint-config-expo)
```

Layout:

```text
src/
  app/            Expo Router screens (every file is a route)
  api/            fetch client (bearer token, 401 → logout) and backend types
  alerts/         WebSocket client, React hook and Spanish labels
  config/urls.ts  server URL helpers
  session/        login state, secure token storage, server settings
  components/     shared UI
```

## Limitations

- Notifications are local: they only arrive while the app is open or in the background with its WebSocket alive. Notifications with the app closed need remote push (Expo push tokens plus a backend sender), which is not built.
- Live video uses the MediaMTX web player inside a WebView, so it works in Expo Go. Native WebRTC (`react-native-webrtc`) would need a development build.
- Plain `http://` works in Expo Go. A standalone Android build needs HTTPS, or cleartext traffic enabled through `expo-build-properties`.
