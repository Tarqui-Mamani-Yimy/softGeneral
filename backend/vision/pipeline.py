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
    rules_engine=None,
    evidence=None,
    on_alert=None,
    banned_candidates: list[dict] | None = None,
) -> RunSummary:
    if stride < 1:
        raise ValueError("stride must be at least 1")
    analyzers = list(analyzers)
    face_engine = None
    if banned_candidates:
        try:
            from vision.face.recognizer import FaceRecognitionEngine
            face_engine = FaceRecognitionEngine()
        except Exception:
            pass
    counts: Counter[str] = Counter()
    last_detections: list[DetectionResult] = []
    last_classifications: list[ClassificationResult] = []
    last_face_matches = []
    frames_read = frames_analyzed = 0
    started = perf_counter()
    if on_progress:
        on_progress(0)
    while (frame := source.read()) is not None:
        if frames_read % stride == 0:
            frames_analyzed += 1
            current = []
            current_cls = []
            for analyzer in analyzers:
                results = analyzer.analyze(frame)
                for result in results:
                    if isinstance(result, DetectionResult):
                        current.append(result)
                        counts[result.label] += 1
                    elif isinstance(result, ClassificationResult):
                        current_cls.append(result)
                        counts[result.label] += 1
            last_detections = current
            last_classifications = current_cls
            if face_engine and banned_candidates:
                try:
                    last_face_matches = face_engine.find_matches(frame, banned_candidates)
                    if last_face_matches:
                        counts["face_match"] += len(last_face_matches)
                except Exception:
                    last_face_matches = []
        timestamp_s = frames_read / source.fps if source.fps else float(frames_read)
        fight_conf = next((c.confidence for c in last_classifications if c.label == "fight" and c.confidence >= 0.5), None)
        annotated = draw_detections(frame.copy(), last_detections, face_matches=last_face_matches, fight_alert=fight_conf)
        if rules_engine is not None and frames_read % stride == 0:
            person_tracks = [result for result in last_detections if result.label == "person"]
            detections = [result for result in last_detections if result.label != "person"]
            events = rules_engine.update(
                frames_read,
                timestamp_s,
                source.frame_size,
                person_tracks,
                detections,
                face_matches=last_face_matches,
                classifications=last_classifications,
            )
            if evidence is not None:
                evidence.record_frame(annotated, timestamp_s)
            if on_alert is not None:
                for event in events:
                    on_alert(event, annotated)
        elif evidence is not None:
            evidence.record_frame(annotated, timestamp_s)
        writer.write(annotated)
        frames_read += 1
        if on_progress and source.frame_count:
            on_progress(min(100, int(frames_read / source.frame_count * 100)))
    if on_progress:
        on_progress(100)
    if evidence is not None:
        evidence.flush()
    elapsed = perf_counter() - started
    return RunSummary(frames_read, frames_analyzed, dict(counts), frames_read / elapsed if elapsed else 0.0)
