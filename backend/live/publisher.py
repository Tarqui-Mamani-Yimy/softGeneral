from __future__ import annotations

import logging
import os
import subprocess
import time

import numpy as np

logger = logging.getLogger(__name__)


class RTSPPublisher:
    def __init__(self, base_url: str, camera_code: str, fps: float, frame_size: tuple[int, int], ffmpeg_binary: str = "ffmpeg"):
        self.url = f"{base_url.rstrip('/')}/{camera_code}_annotated"
        self.fps = fps or 30.0
        self.frame_size = frame_size
        self.binary = ffmpeg_binary
        self.process = None
        self.retry_initial = 0.25
        self.retry_backoff = self.retry_initial
        self.next_retry = 0.0

    def __enter__(self):
        self._start()
        return self

    def _start(self):
        if time.monotonic() < self.next_retry:
            return False
        if self.process is not None and self.process.poll() is None:
            return True
        width, height = self.frame_size
        # VP8: every WebRTC browser must support it, while H.264 playback depends on
        # the browser (Firefox on Linux often offers VP8 only). Keyframe every 2 s
        # so viewers joining late get a picture quickly.
        command = [
            self.binary, "-y", "-loglevel", "error",
            "-f", "rawvideo", "-pix_fmt", "bgr24", "-s", f"{width}x{height}", "-r", str(self.fps), "-i", "-",
            "-an", "-c:v", "libvpx", "-deadline", "realtime", "-cpu-used", "8", "-b:v", "1M",
            "-g", str(max(1, round(self.fps * 2))), "-pix_fmt", "yuv420p",
            "-rtsp_transport", "tcp", "-f", "rtsp", self.url,
        ]
        try:
            self.process = subprocess.Popen(command, stdin=subprocess.PIPE, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE, shell=False, text=False)
            self.retry_backoff = self.retry_initial
            return True
        except OSError:
            logger.warning("Could not start live RTSP publisher for %s", self.url)
            self.process = None
            self._schedule_retry()
            return False

    def _schedule_retry(self):
        self.next_retry = time.monotonic() + self.retry_backoff
        self.retry_backoff = min(self.retry_backoff * 2, 10.0)

    def _finish_process(self):
        if self.process is None:
            return
        try:
            if self.process.stderr:
                lines = self.process.stderr.read().decode(errors="replace").splitlines()
                if lines:
                    logger.warning("Live publisher %s exited; ffmpeg stderr: %s", self.url, " | ".join(lines[-5:]))
            self.process.wait(timeout=0.2)
        except Exception:
            pass
        self.process = None

    def publish(self, frame: np.ndarray):
        if self.process is not None and self.process.poll() is not None:
            self._finish_process()
            self._schedule_retry()
        if self.process is None:
            if not self._start():
                return False
        try:
            self.process.stdin.write(frame.tobytes())
            self.process.stdin.flush()
            return True
        except (BrokenPipeError, OSError):
            self._finish_process()
            self._schedule_retry()
            return False

    def close(self):
        if self.process is not None:
            if self.process.stdin:
                self.process.stdin.close()
            self.process.terminate()
            try:
                self.process.wait(timeout=2)
            except subprocess.TimeoutExpired:
                self.process.kill()
            self._finish_process()
            self.process = None

    def __exit__(self, exc_type, exc_value, traceback):
        self.close()
