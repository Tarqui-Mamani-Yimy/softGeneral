from __future__ import annotations

import cv2
import numpy as np

from vision.detection.types import DetectionResult


def draw_detections(frame: np.ndarray, detections: list[DetectionResult]) -> np.ndarray:
    for detection in detections:
        x1, y1, x2, y2 = (int(value) for value in detection.box)
        cv2.rectangle(frame, (x1, y1), (x2, y2), (0, 255, 0), 2)
        suffix = f" #{detection.track_id}" if detection.track_id is not None else ""
        label = f"{detection.label}{suffix} {detection.confidence:.2f}"
        cv2.putText(frame, label, (x1, max(y1 - 5, 12)), cv2.FONT_HERSHEY_SIMPLEX, 0.4, (0, 255, 0), 1, cv2.LINE_AA)
    return frame
