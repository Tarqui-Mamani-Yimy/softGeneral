from __future__ import annotations

from pathlib import Path

import cv2
import numpy as np


class VideoWriter:
    def __init__(self, path: str | Path, fps: float, frame_size: tuple[int, int]):
        self.path = Path(path)
        self.fps = fps or 25.0
        self.frame_size = frame_size
        self._writer: cv2.VideoWriter | None = None

    def __enter__(self) -> VideoWriter:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self._writer = cv2.VideoWriter(str(self.path), cv2.VideoWriter_fourcc(*"mp4v"), self.fps, self.frame_size)
        if not self._writer.isOpened():
            raise ValueError(f"Unable to open output video: {self.path}")
        return self

    def __exit__(self, exc_type, exc_value, traceback) -> None:
        if self._writer is not None:
            self._writer.release()
            self._writer = None

    def write(self, frame: np.ndarray) -> None:
        if self._writer is None:
            raise RuntimeError("VideoWriter must be used as a context manager")
        self._writer.write(frame)
