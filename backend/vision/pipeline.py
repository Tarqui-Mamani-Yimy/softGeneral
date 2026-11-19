from __future__ import annotations

from collections import Counter
from dataclasses import dataclass
from time import perf_counter
from typing import Callable, Iterable

import numpy as np

from vision.annotation.draw import draw_detections
from vision.detection.types import ClassificationResult, DetectionResult
from vision.sources.base import VideoSource


@dataclass(frozen=True)
class RunSummary:
    frames_read: int
    frames_analyzed: int
    detections_per_label: dict[str, int]
    processing_fps: float


def process_video(
    source: VideoSource,
    writer,
    analyzers: Iterable,
    stride: int = 1,
    on_progress: Callable[[int], None] | None = None,
) -> RunSummary:
    if stride < 1:
        raise ValueError("stride must be at least 1")
    analyzers = list(analyzers)
    counts: Counter[str] = Counter()
    last_detections: list[DetectionResult] = []
    frames_read = frames_analyzed = 0
    started = perf_counter()
    if on_progress:
        on_progress(0)
    while (frame := source.read()) is not None:
        if frames_read % stride == 0:
            frames_analyzed += 1
            current = []
            for analyzer in analyzers:
                results = analyzer.analyze(frame)
                for result in results:
                    if isinstance(result, DetectionResult):
                        current.append(result)
                        counts[result.label] += 1
                    elif isinstance(result, ClassificationResult):
                        counts[result.label] += 1
            last_detections = current
        writer.write(draw_detections(frame.copy(), last_detections))
        frames_read += 1
        if on_progress and source.frame_count:
            on_progress(min(100, int(frames_read / source.frame_count * 100)))
    if on_progress:
        on_progress(100)
    elapsed = perf_counter() - started
    return RunSummary(frames_read, frames_analyzed, dict(counts), frames_read / elapsed if elapsed else 0.0)
