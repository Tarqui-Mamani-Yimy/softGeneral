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
    fight_alert: float | None = None,
) -> np.ndarray:
    for detection in detections:
        x1, y1, x2, y2 = (int(value) for value in detection.box)
        suffix = f" #{detection.track_id}" if detection.track_id is not None else ""
        
        if detection.label == "player":
            color = (235, 180, 52)  # Cyan / Sky blue
            text = f"JUGADOR{suffix} {int(detection.confidence * 100)}%"
            cv2.rectangle(frame, (x1, y1), (x2, y2), color, 2)
        elif detection.label == "referee":
            color = (0, 215, 255)  # Yellow / Amber
            text = f"ARBITRO {int(detection.confidence * 100)}%"
            cv2.rectangle(frame, (x1, y1), (x2, y2), color, 2)
        elif detection.label == "ball":
            color = (50, 255, 50)  # Bright neon green
            text = f"BALON {int(detection.confidence * 100)}%"
            cv2.rectangle(frame, (x1, y1), (x2, y2), color, 2)
            cx, cy = (x1 + x2) // 2, (y1 + y2) // 2
            r = max(6, max(x2 - x1, y2 - y1) // 2)
            cv2.circle(frame, (cx, cy), r, color, 2)
        elif detection.label == "gun":
            color = (0, 0, 255)
            text = f"ARMA {int(detection.confidence * 100)}%"
            cv2.rectangle(frame, (x1, y1), (x2, y2), color, 2)
        elif detection.label in {"fire", "smoke"}:
            color = (0, 140, 255)
            text = f"{detection.label.upper()} {int(detection.confidence * 100)}%"
            cv2.rectangle(frame, (x1, y1), (x2, y2), color, 2)
        else:
            color = (0, 255, 0)
            text = f"{detection.label}{suffix} {detection.confidence:.2f}"
            cv2.rectangle(frame, (x1, y1), (x2, y2), color, 2)

        cv2.putText(frame, text, (x1, max(y1 - 5, 12)), cv2.FONT_HERSHEY_SIMPLEX, 0.4, color, 1, cv2.LINE_AA)

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

    if fight_alert is not None and fight_alert >= 0.5:
        h, w = frame.shape[:2]
        fight_label = f"ALERTA: ALTERCADO / PELEA DETECTADA ({int(fight_alert * 100)}%)"
        (bw, bh), _ = cv2.getTextSize(fight_label, cv2.FONT_HERSHEY_SIMPLEX, 0.65, 2)
        top_y2 = max(bh + 14, 34)
        cv2.rectangle(frame, (0, 0), (w, top_y2), (0, 0, 180), -1)
        text_x = max(10, (w - bw) // 2)
        cv2.putText(
            frame,
            fight_label,
            (text_x, top_y2 - 9),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.65,
            (255, 255, 255),
            2,
            cv2.LINE_AA,
        )

    return frame
