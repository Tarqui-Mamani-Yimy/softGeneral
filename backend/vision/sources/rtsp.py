from __future__ import annotations

import threading
import time
from pathlib import Path
from typing import Callable

import cv2
import numpy as np


class RTSPSource:
    # Waiting limits used by start(): the first frame of an RTSP stream can take a few
    # seconds, and the frame rate is measured over a short window of arrivals.
    FPS_SAMPLE_FRAMES = 10
    FPS_SAMPLE_SECONDS = 1.0

    def __init__(
        self,
        source: str | int,
        capture_factory: Callable | None = None,
        reconnect_initial: float = 0.25,
        first_frame_timeout: float = 10.0,
        default_fps: float = 10.0,
    ):
        self.source = source
        self.capture_factory = capture_factory or (lambda value: cv2.VideoCapture(value, cv2.CAP_FFMPEG))
        self.reconnect_initial = reconnect_initial
        self.first_frame_timeout = first_frame_timeout
        self.default_fps = default_fps
        self._reported_fps = 0.0
        self._arrivals: list[float] = []
        self._measured = threading.Event()
        self._stop = threading.Event()
        self._condition = threading.Condition()
        self._thread: threading.Thread | None = None
        self._ready = threading.Event()
        self._capture = None
        self._latest: tuple[np.ndarray, float, int] | None = None
        self._returned_sequence = 0
        self._sequence = 0
        self.dropped_frames = 0
        self.capture_timestamp = 0.0
        self.fps = default_fps
        self.frame_size = (0, 0)
        self.frame_count = None

    @property
    def is_running(self) -> bool:
        return self._thread is not None and self._thread.is_alive()

    def __enter__(self):
        self.start()
        return self

    def __exit__(self, exc_type, exc_value, traceback):
        self.close()

    def start(self):
        if self.is_running:
            return self
        self._stop.clear()
        self._ready.clear()
        self._measured.clear()
        self._arrivals = []
        self._thread = threading.Thread(target=self._reader, name="rtsp-reader", daemon=True)
        self._thread.start()
        # Metadata (size, fps) from OpenCV is unreliable until frames arrive:
        # wait for the first frame, then for a short fps sample.
        if self._ready.wait(timeout=self.first_frame_timeout):
            self._measured.wait(timeout=self.FPS_SAMPLE_SECONDS + 0.5)
        self.fps = self._resolve_fps()
        return self

    def refresh_fps(self, timeout: float | None = None) -> float:
        """Re-resolve fps once the arrival sample is complete (e.g. when start()
        returned before the first frame because the camera was slow to deliver)."""
        self._measured.wait(timeout=self.FPS_SAMPLE_SECONDS + 0.5 if timeout is None else timeout)
        self.fps = self._resolve_fps()
        return self.fps

    def _resolve_fps(self) -> float:
        reported = self._reported_fps if 1.0 <= self._reported_fps <= 60.0 else 0.0
        measured = 0.0
        arrivals = list(self._arrivals)
        if len(arrivals) >= 3 and arrivals[-1] > arrivals[0]:
            measured = (len(arrivals) - 1) / (arrivals[-1] - arrivals[0])
            if measured > 60.0:  # buffered burst, not the real rate
                measured = 0.0
        if reported and (not measured or abs(measured - reported) / reported <= 0.25):
            return reported
        return measured or reported or self.default_fps

    def read(self, timeout: float = 0.1) -> np.ndarray | None:
        deadline = time.monotonic() + timeout
        with self._condition:
            while not self._stop.is_set() and (self._latest is None or self._latest[2] == self._returned_sequence):
                remaining = deadline - time.monotonic()
                if remaining <= 0:
                    return None
                self._condition.wait(remaining)
            if self._latest is None or self._latest[2] == self._returned_sequence:
                return None
            frame, timestamp, sequence = self._latest
            self._returned_sequence = sequence
            self.capture_timestamp = timestamp
            return frame.copy()

    def close(self):
        self._stop.set()
        with self._condition:
            self._condition.notify_all()
        thread = self._thread
        if thread is not None:
            thread.join(timeout=5)
        # The reader thread owns the capture and releases it on exit. Releasing it
        # here while the thread may still be inside read() crashes OpenCV.
        if thread is None or not thread.is_alive():
            self._thread = None
            if self._capture is not None:
                self._capture.release()
                self._capture = None

    def _reader(self):
        backoff = self.reconnect_initial
        while not self._stop.is_set():
            try:
                capture = self.capture_factory(self.source)
                self._capture = capture
                if not capture.isOpened():
                    capture.release()
                    raise RuntimeError("capture is not open")
                self._reported_fps = float(capture.get(cv2.CAP_PROP_FPS) or 0.0)
                backoff = self.reconnect_initial
                while not self._stop.is_set():
                    ok, frame = capture.read()
                    if not ok or frame is None:
                        break
                    timestamp = time.time()
                    if not self._ready.is_set():
                        self.frame_size = (int(frame.shape[1]), int(frame.shape[0]))
                        self._ready.set()
                    if not self._measured.is_set():
                        self._arrivals.append(time.monotonic())
                        if len(self._arrivals) >= self.FPS_SAMPLE_FRAMES or self._arrivals[-1] - self._arrivals[0] >= self.FPS_SAMPLE_SECONDS:
                            self._measured.set()
                    with self._condition:
                        if self._latest is not None and self._latest[2] != self._returned_sequence:
                            self.dropped_frames += 1
                        self._sequence += 1
                        self._latest = (frame, timestamp, self._sequence)
                        self._condition.notify_all()
                capture.release()
                self._capture = None
            except Exception:
                if self._capture is not None:
                    self._capture.release()
                    self._capture = None
            if self._stop.wait(backoff):
                break
            backoff = min(backoff * 2, 10.0)
