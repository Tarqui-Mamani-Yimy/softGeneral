from __future__ import annotations

from typing import TYPE_CHECKING

import cv2
import numpy as np

from vision.detection.types import DetectionResult

if TYPE_CHECKING:
    from vision.face.recognizer import FaceMatch


def draw_detections(
    frame: np.ndarray,
    detections: list[DetectionResult],
    face_matches: list[FaceMatch] | None = None,
) -> np.ndarray:
    for detection in detections:
        x1, y1, x2, y2 = (int(value) for value in detection.box)
        cv2.rectangle(frame, (x1, y1), (x2, y2), (0, 255, 0), 2)
        suffix = f" #{detection.track_id}" if detection.track_id is not None else ""
        label = f"{detection.label}{suffix} {detection.confidence:.2f}"
        cv2.putText(frame, label, (x1, max(y1 - 5, 12)), cv2.FONT_HERSHEY_SIMPLEX, 0.4, (0, 255, 0), 1, cv2.LINE_AA)

    if face_matches:
        for match in face_matches:
            x1, y1, x2, y2 = (int(value) for value in match.bbox)
            # Red box for banned person
            cv2.rectangle(frame, (x1, y1), (x2, y2), (0, 0, 255), 3)
            label = f"VETADO: {match.full_name} ({int(match.confidence * 100)}%)"
            # Label background banner
            (tw, th), _ = cv2.getTextSize(label, cv2.FONT_HERSHEY_SIMPLEX, 0.5, 1)
            banner_y1 = max(0, y1 - th - 8)
            banner_y2 = max(th + 8, y1)
            cv2.rectangle(frame, (x1, banner_y1), (x1 + tw + 8, banner_y2), (0, 0, 255), -1)
            cv2.putText(
                frame,
                label,
                (x1 + 4, banner_y2 - 4),
                cv2.FONT_HERSHEY_SIMPLEX,
                0.5,
                (255, 255, 255),
                1,
                cv2.LINE_AA,
            )

    return frame
