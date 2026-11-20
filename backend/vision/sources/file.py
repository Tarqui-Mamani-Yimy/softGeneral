from __future__ import annotations

from pathlib import Path

import cv2
import numpy as np

from vision.sources.base import VideoPath


class FileSource:
    def __init__(self, path: VideoPath):
        self.path = Path(path)
        self._capture: cv2.VideoCapture | None = None
        self.fps = 0.0
        self.frame_size = (0, 0)
        self.frame_count: int | None = None

    def __enter__(self) -> FileSource:
        self._capture = cv2.VideoCapture(str(self.path))
        if not self._capture.isOpened():
            raise ValueError(f"Unable to open video: {self.path}")
        self.fps = self._capture.get(cv2.CAP_PROP_FPS) or 0.0
        width = int(self._capture.get(cv2.CAP_PROP_FRAME_WIDTH))
        height = int(self._capture.get(cv2.CAP_PROP_FRAME_HEIGHT))
        self.frame_size = (width, height)
        count = int(self._capture.get(cv2.CAP_PROP_FRAME_COUNT))
        self.frame_count = count if count > 0 else None
        return self

    def __exit__(self, exc_type, exc_value, traceback) -> None:
        if self._capture is not None:
            self._capture.release()
            self._capture = None

    def read(self) -> np.ndarray | None:
        if self._capture is None:
            raise RuntimeError("FileSource must be used as a context manager")
        success, frame = self._capture.read()
        return frame if success else None
