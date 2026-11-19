from __future__ import annotations

from contextlib import AbstractContextManager
from pathlib import Path
from typing import Protocol

import numpy as np


class VideoSource(Protocol, AbstractContextManager):
    fps: float
    frame_size: tuple[int, int]
    frame_count: int | None

    def read(self) -> np.ndarray | None:
        ...


class PathLike(Protocol):
    def __fspath__(self) -> str:
        ...


VideoPath = str | Path | PathLike
