# MediaMTX RTSP & WebRTC Server

MediaMTX runs as a lightweight container in Docker Compose to ingest RTSP camera feeds and serve low-latency WebRTC streams directly to browser clients.

## 1. Start MediaMTX

Start the service via Docker Compose (using the `camera-sim` profile or directly):

```bash
docker compose up -d mediamtx
```

MediaMTX listens on:
- RTSP: `127.0.0.1:8554` (publish and subscribe)
- WebRTC: `127.0.0.1:8889` (HTTP signaling & WHEP/WHIP) + `127.0.0.1:8889/udp` (ICE media)
- HLS: `127.0.0.1:8888`

## 2. Publish Simulated Camera

Use the helper script to loop any local video file as an RTSP stream:

```bash
./scripts/sim_camera.sh datos/videos_prueba/match.mp4 cam_north_01
```

This publishes to `rtsp://127.0.0.1:8554/cam_north_01`.

You can view the raw stream directly in your browser via WebRTC:
- http://localhost:8889/cam_north_01

## 3. Register Camera in the API

Create the camera record through the API (`POST /api/v1/cameras` with `cameras.manage` permission):

```bash
curl -X POST http://localhost:8000/api/v1/cameras \
  -H "Authorization: Bearer <ADMIN_JWT_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{
    "code": "cam_north_01",
    "name": "North Stand Main",
    "location": "North Stand, Gate 4",
    "source_type": "rtsp",
    "source_url": "rtsp://127.0.0.1:8554/cam_north_01"
  }'
```

The camera's annotated live output will be published by the worker to `cam_north_01_annotated`.

## 4. Start the Live Vision Worker

Run the live processing worker for the registered camera:

```bash
cd backend
.venv/bin/python live_worker.py --camera cam_north_01
```

The worker reads from `source_url`, executes YOLO detection and rule evaluation, and republishes the annotated frames to `rtsp://127.0.0.1:8554/cam_north_01_annotated`. Guards can then watch the live annotated feed on the web frontend (`/cameras`) via WebRTC at `http://localhost:8889/cam_north_01_annotated`.
