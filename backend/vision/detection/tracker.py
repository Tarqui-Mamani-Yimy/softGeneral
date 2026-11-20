from __future__ import annotations

import os
from pathlib import Path

import numpy as np

from vision.detection.types import DetectionResult


class PersonTracker:
    def __init__(self, model_path: str | Path | None = None, device: str | None = None):
        self.model_path = Path(model_path or os.getenv("COCO_MODEL_PATH", Path.home() / ".cache/softgeneral/weights/yolo11n.pt"))
        self.device = device or os.getenv("VISION_DEVICE", "cpu")
        self._model = None

    def _get_model(self):
        if self._model is None:
            from ultralytics import YOLO

            self.model_path.parent.mkdir(parents=True, exist_ok=True)
            self._model = YOLO(str(self.model_path))
        return self._model

    def analyze(self, frame: np.ndarray) -> list[DetectionResult]:
        result = self._get_model().track(frame, persist=True, classes=[0], device=self.device, verbose=False)[0]
        if result.boxes is None:
            return []
        ids = result.boxes.id
        detections = []
        for index, box in enumerate(result.boxes):
            track_id = int(ids[index]) if ids is not None else None
            detections.append(DetectionResult("person", float(box.conf[0]), tuple(float(value) for value in box.xyxy[0]), track_id))
        return detections
