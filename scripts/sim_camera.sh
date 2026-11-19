#!/usr/bin/env bash
# scripts/sim_camera.sh
# Streams a local video file in an infinite loop via RTSP to MediaMTX.
# Usage: ./scripts/sim_camera.sh <video_file> <stream_path>
# Example: ./scripts/sim_camera.sh datos/videos_prueba/match.mp4 cam1

set -euo pipefail

if [ "$#" -ne 2 ]; then
  echo "Usage: $0 <video_file> <stream_path>" >&2
  echo "Example: $0 ./sample.mp4 cam1" >&2
  exit 1
fi

VIDEO_FILE="$1"
STREAM_PATH="$2"

if [ ! -f "$VIDEO_FILE" ]; then
  echo "Error: Video file '$VIDEO_FILE' not found." >&2
  exit 1
fi

if ! command -v ffmpeg >/dev/null 2>&1; then
  echo "Error: ffmpeg is required but not installed or not in PATH." >&2
  exit 1
fi

RTSP_URL="rtsp://127.0.0.1:8554/${STREAM_PATH}"

echo "=========================================================="
echo "Publishing RTSP stream:"
echo "  File:   $VIDEO_FILE"
echo "  Target: $RTSP_URL"
echo ""
echo "Watch live in browser via WebRTC:"
echo "  http://localhost:8889/${STREAM_PATH}"
echo "Watch via ffplay:"
echo "  ffplay -rtsp_transport tcp $RTSP_URL"
echo "=========================================================="
echo "Press Ctrl+C to terminate the stream."

# Clean exit on SIGINT or SIGTERM
trap 'echo ""; echo "Stream stopped by user."; exit 0' INT TERM

ffmpeg -re -stream_loop -1 -i "$VIDEO_FILE" \
  -c:v libvpx -deadline realtime -cpu-used 8 -b:v 1M -pix_fmt yuv420p -g 20 -keyint_min 20 \
  -an -f rtsp -rtsp_transport tcp "$RTSP_URL"
